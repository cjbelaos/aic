/**
 * Sales Order Writer — Apps Script command gateway (DRAFT / NOT DEPLOYED).
 *
 * This deployment is the SINGLE serialization boundary for authoritative
 * sales-order writes:
 *   1. Next.js authenticates the user, validates the request, and signs a
 *      constrained command envelope (HMAC-SHA256, timestamped, one CommandId).
 *   2. Apps Script verifies the envelope AND that payloadHash (recomputed over
 *      the actual payload) matches the signed value, claims the script
 *      LockService lock, and inside the lock checks the idempotency receipt
 *      (same CommandId + same hash → replay; same CommandId + different hash
 *      → 409 reject), reads the current order version, validates
 *      expectedVersion, allocates the AIC-SO-YYYY-NNNN display number from
 *      SalesOrderSequences, and writes order header, items, history, sequence,
 *      command receipt and (for confirmed-order mutations) the outbound
 *      sync-job row as ONE transactional unit.
 *   3. Source mutations are staged in memory and committed by one Sheets API
 *      spreadsheets.batchUpdate, including the receipt. No SpreadsheetApp
 *      write or flush is used as a substitute for a transaction.
 *   4. ContentService returns HTTP 200; semantic status is in the JSON body.
 *
 * Column layouts BELOW MUST match src/lib/salesOrders/repository.ts (the
 * authoritative application-side contract). Change them together.
 *
 * Secrets live in Script Properties only (GATEWAY_SHARED_SECRET,
 * SOURCE_SPREADSHEET_ID, DESTINATION_SPREADSHEET_ID, DESTINATION_SHEET_ID,
 * SYNC_ENV=[staging|live], SYNC_ALLOW_LIVE=1). Never expose a generic
 * arbitrary-range writer through this endpoint.
 */

var PROTOCOL_VERSION = 1;
var LOCK_WAIT_SECONDS = 8;
var LEASE_VALID_SECONDS = 300;     // worker claim lease (5 minutes)
var DESTINATION_AGGREGATE_BATCH = 400; // max rows per destination batch write

var ALLOWED_COMMAND_TYPES = [
  "so.create", "so.update", "so.confirm", "so.hold", "so.resume",
  "so.cancel", "so.close", "so.fulfill", "so.attach", "so.documents.link",
  "so.sync.claim", "so.sync.complete", "so.sync.retry", "so.receipt",
];

/** Tab names — MUST match repository.ts. */
var TABS = {
  orders: "SalesOrders", items: "SalesOrderItems", history: "SalesOrderHistory",
  documents: "SalesOrderDocuments", fulfillments: "SalesOrderFulfillments",
  documentLinks: "SalesOrderDocumentLinks", sequences: "SalesOrderSequences",
  commands: "SalesOrderCommands", syncJobs: "SalesOrderSyncJobs",
  syncMap: "SalesOrderSyncMap", importMap: "SalesOrderImportMap",
};

/** Column counts per tab — MUST match repository.ts header arrays. */
var WIDTHS = { orders: 35, items: 31, history: 11, documents: 13, fulfillments: 15,
  documentLinks: 11, sequences: 5, commands: 8, syncJobs: 16, syncMap: 8, importMap: 12 };

/** Stage all source changes, then atomically submit their explicit cell values.
 * StringValue is deliberate: customer text must never become a formula.
 * Reads after staged writes see the staged state. A failed batch is discarded;
 * callers must abandon this transaction after a commit error.
 */
function transaction_(spreadsheetId) {
  var book = SpreadsheetApp.openById(spreadsheetId), cache = {}, requests = [];
  function wrap(raw) {
    if (!raw) return null;
    var id = raw.getSheetId();
    if (cache[id]) return cache[id];
    var values = raw.getDataRange().getValues();
    var maxRows = raw.getMaxRows(), maxCols = raw.getMaxColumns();
    function lastRow() {
      for (var i = values.length - 1; i >= 0; i--) if (values[i].some(function (v) { return v !== "" && v !== null; })) return i + 1;
      return 0;
    }
    function range(row, col, height, width) {
      if (height < 1 || width < 1) throw new Error("Invalid staged range.");
      function set(rows) {
        if (rows.length !== height || rows.some(function (r) { return r.length !== width; })) throw new Error("Column contract mismatch.");
        if (row + height - 1 > maxRows) {
          requests.push({ appendDimension: { sheetId: id, dimension: "ROWS", length: row + height - 1 - maxRows } });
          maxRows = row + height - 1;
        }
        if (col + width - 1 > maxCols) throw new Error("Provision missing columns before writing.");
        rows.forEach(function (r, i) {
          while (values.length < row + i) values.push([]);
          r.forEach(function (v, j) { values[row + i - 1][col + j - 1] = v == null ? "" : v; });
        });
        requests.push({ updateCells: {
          range: { sheetId: id, startRowIndex: row - 1, endRowIndex: row + height - 1, startColumnIndex: col - 1, endColumnIndex: col + width - 1 },
          rows: rows.map(function (r) { return { values: r.map(function (v) {
            if (v === "" || v === null || v === undefined) return {};
            if (typeof v === "number") { if (!isFinite(v)) throw new Error("Invalid number."); return { userEnteredValue: { numberValue: v } }; }
            if (typeof v === "boolean") return { userEnteredValue: { boolValue: v } };
            return { userEnteredValue: { stringValue: String(v) } };
          }) }; }), fields: "userEnteredValue"
        } });
      }
      return {
        getValues: function () { return Array.from({ length: height }, function (_, i) {
          return Array.from({ length: width }, function (_, j) { var v = (values[row + i - 1] || [])[col + j - 1]; return v == null ? "" : v; });
        }); },
        setValues: set,
        clear: function () { set(Array.from({ length: height }, function () { return Array(width).fill(""); })); }
      };
    }
    cache[id] = { getSheetId: function () { return id; }, getLastRow: lastRow,
      getMaxRows: function () { return maxRows; }, getMaxColumns: function () { return maxCols; },
      getRange: range, getDataRange: function () { return range(1, 1, Math.max(1, lastRow()), Math.max(1, values.reduce(function (n, r) { return Math.max(n, r.length); }, 0))); }
    };
    return cache[id];
  }
  return {
    getSheetByName: function (name) { var sheet = wrap(book.getSheetByName(name)); if (!sheet) throw new Error("Missing canonical tab: " + name); return sheet; },
    getSheetById: function (id) { return wrap(book.getSheetById(id)); },
    commit: function () { if (!requests.length) return; Sheets.Spreadsheets.batchUpdate({ requests: requests }, spreadsheetId); requests = []; }
  };
}

function enqueueOrder_(sheets, order) {
  if (!order.salesOrderNo || order.orderStatus === "DRAFT") return;
  var props = properties_(), destination = props.getProperty("DESTINATION_SPREADSHEET_ID"), sheetId = props.getProperty("DESTINATION_SHEET_ID");
  // Outbox is independent of worker enablement: turning sync off cannot lose jobs.
  if (!destination || !sheetId) throw new Error("Configure the reporting destination before confirming orders.");
  var id = order.salesOrderId + ":" + order.version + ":" + destination + ":" + sheetId;
  if (findRows_(sheets, TABS.syncJobs, 0, id).length) return;
  var now = new Date().toISOString();
  appendRows_(sheets, TABS.syncJobs, [[id, order.salesOrderId, order.version, destination, String(sheetId),
    "PENDING", 0, now, "", "", "", "", "", now, "", ""]], WIDTHS.syncJobs);
}

function properties_() {
  return PropertiesService.getScriptProperties();
}

/** Minimal canonical JSON matching src/lib/salesOrders/crypto-hash.ts. */
function canonicalJson_(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson_).join(",") + "]";
  var keys = Object.keys(value).sort();
  var parts = keys.map(function (key) {
    return JSON.stringify(key) + ":" + canonicalJson_(value[key]);
  });
  return "{" + parts.join(",") + "}";
}
function base64url_(bytes) {
  return Utilities.base64Encode(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function hmacBase64Url_(secret, message) {
  return base64url_(Utilities.computeHmacSha256Signature(message, secret, Utilities.Charset.UTF_8));
}
function sha256Hex_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
    .map(function (byte) { return ((byte + 256) % 256).toString(16).padStart(2, "0"); }).join("");
}
function payloadHash_(payload) { return sha256Hex_(canonicalJson_(payload)); }
function jsonResponse_(body, status) {
  return ContentService.createTextOutput(JSON.stringify(Object.assign({}, body, { status: status })))
    .setMimeType(ContentService.MimeType.JSON);
}

function badRequest_(message, status) {
  return jsonResponse_({ ok: false, code: "GATEWAY_REJECTED", message: message, retryable: false }, status || 400);
}

/**
 * Signature/command verification. Timestamp window matches the server default
 * (5 minutes) plus tolerance for clock skew. The signed payloadHash MUST match
 * the hash recomputed over the received payload — a mismatch proves the body
 * was tampered with after signing.
 */
function verifyEnvelope_(envelope, payload) {
  if (!envelope || typeof envelope !== "object") return "Envelope is required.";
  var props = properties_();
  var secret = props.getProperty("GATEWAY_SHARED_SECRET");
  if (!secret) return "Gateway secret is not configured (Script Properties).";
  if (envelope.version !== PROTOCOL_VERSION) return "Unsupported protocol version.";
  if (!envelope.commandId || !envelope.commandType) return "commandId and commandType are required.";
  if (ALLOWED_COMMAND_TYPES.indexOf(envelope.commandType) === -1) return "Command type not allowed.";
  var clone = JSON.parse(JSON.stringify(envelope));
  delete clone.signature;
  var expected = hmacBase64Url_(secret, canonicalJson_(clone));
  if (expected.length !== String(envelope.signature || "").length) return "Signature is invalid.";
  if (expected !== envelope.signature) return "Signature is invalid.";
  var issuedAt = Date.parse(envelope.issuedAt);
  if (Number.isNaN(issuedAt)) return "issuedAt is invalid.";
  var age = (new Date()).getTime() - issuedAt;
  if (age < -300000 || age > 300000) return "Command envelope is stale (outside the 5-minute window).";
  if (payloadHash_(payload) !== envelope.payloadHash) return "payloadHash does not match the signed payload.";
  return "";
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return null;
  try {
    var parsed = JSON.parse(e.postData.contents);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (error) {
    return null;
  }
}
/** Applies the payload under the script lock; returns an HTTP response. */
function doPost(e) {
  var body = parseBody_(e);
  if (!body) return badRequest_("Request body must be a JSON object with envelope and payload.");
  var envelope = body.envelope;
  var payload = body.payload || {};
  var verifyError = verifyEnvelope_(envelope, payload);
  if (verifyError) return badRequest_(verifyError);

  try {
    return withOrderLock_(envelope.commandId, function () {
      var sourceSpreadsheetId = properties_().getProperty("SOURCE_SPREADSHEET_ID");
      if (!sourceSpreadsheetId) throw new Error("SOURCE_SPREADSHEET_ID is not configured (Script Properties).");
      var sheets = transaction_(sourceSpreadsheetId);
      var existing = findReceipt_(sheets, envelope.commandId);
      if (existing) {
        // Replay of the SAME command with the SAME content returns the original
        // result. The SAME command ID with DIFFERENT content is rejected.
        if (String(existing[1]) !== (payload.requestHash || envelope.payloadHash) || String(existing[7]) !== String(envelope.actorUserId)) {
          return jsonResponse_({
            ok: false, code: "COMMAND_REPLAY",
            message: "Command ID was already used with different content.",
            retryable: false,
          }, 409);
        }
        return jsonResponse_({ ok: true, replayed: true, result: JSON.parse(existing[5]) }, 200);
      }
      if (envelope.commandType === "so.receipt") return jsonResponse_({ ok: true, replayed: false, result: null }, 200);
      var applied = applyCommand_(sheets, envelope, payload);
      var receipt = [
        envelope.commandId, payload.requestHash || envelope.payloadHash, envelope.commandType,
        String(payload.salesOrderId || ""), applied.result.version,
        JSON.stringify(applied.result), new Date().toISOString(), envelope.actorUserId || "",
      ];
      appendRows_(sheets, TABS.commands, [receipt], WIDTHS.commands);
      sheets.commit();
      return jsonResponse_({ ok: true, replayed: false, result: applied.result }, 200);
    });
  } catch (error) {
    var conflict = conflictBody_(error);
    if (conflict) return jsonResponse_(conflict, 409);
    var message = String(error && error.message ? error.message : error);
    return jsonResponse_({ ok: false, code: "GATEWAY_REJECTED", message: message, retryable: false }, 400);
  }
}

/**
 * Runs `body` while holding the script lock. LockService.waitLock THROWS on
 * timeout (documented behavior), which we map to HTTP 503 GATEWAY_BUSY so the
 * client can retry the SAME commandId for exactly-once semantics.
 */
function withOrderLock_(tag, body) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(LOCK_WAIT_SECONDS * 1000);
  } catch (error) {
    return jsonResponse_({
      ok: false, code: "GATEWAY_BUSY",
      message: "The sales-order gateway is busy; retry with the same commandId.",
      retryable: true,
    }, 503);
  }
  try {
    return body();
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}

function findReceipt_(sheets, commandId) {
  var values = sheets.getSheetByName(TABS.commands).getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === commandId) return values[i];
  }
  return null;
}

function findRows_(sheets, tab, columnIndex, id) {
  var values = sheets.getSheetByName(tab).getDataRange().getValues();
  var matches = [];
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][columnIndex]) === String(id)) matches.push({ row: i + 1, values: values[i] });
  }
  return matches;
}

/**
 * Executes the business command against the authoritative sheets using only
 * an in-memory transaction and one Sheets API batchUpdate. Returns { result } — the full result object the receipt records.
 */
function applyCommand_(sheets, envelope, payload) {
  var commandType = envelope.commandType;
  if (commandType === "so.create") return applyCreate_(sheets, envelope, payload);
  if (commandType === "so.update") return applyUpdate_(sheets, envelope, payload);
  if (commandType === "so.confirm" || commandType === "so.hold" || commandType === "so.resume" ||
      commandType === "so.cancel" || commandType === "so.close") {
    return applyHeaderMutation_(sheets, envelope, payload);
  }
  if (commandType === "so.fulfill") return applyFulfill_(sheets, envelope, payload);
  if (commandType === "so.attach") return applyAttach_(sheets, envelope, payload);
  if (commandType === "so.documents.link") return applyDocumentLink_(sheets, envelope, payload);
  if (commandType === "so.sync.claim") return applySyncClaim_(sheets, envelope, payload);
  if (commandType === "so.sync.complete") return applySyncComplete_(sheets, envelope, payload);
  if (commandType === "so.sync.retry") return applySyncRetry_(sheets, envelope, payload);
  throw new Error("Command type not implemented: " + commandType);
}
// ---------------------------------------------------------------------------
// Row mappers — column order MUST match src/lib/salesOrders/repository.ts.
// ---------------------------------------------------------------------------
function orderToRow_(order, versionOverride, salesOrderNoOverride) {
  return [
    order.salesOrderId, salesOrderNoOverride !== undefined ? salesOrderNoOverride : order.salesOrderNo,
    order.legacyTrackerNo || "", order.receivedDate || "", order.customerId || "",
    order.customerNameSnapshot || "", order.customerTINSnapshot || "", order.billingAddressSnapshot || "",
    order.contactId || "", order.contactNameSnapshot || "", order.contactPhoneSnapshot || "",
    order.deliveryAddressSnapshot || "", order.customerPONo || "", order.quotationNo || "",
    order.paymentTermId || "", order.paymentTermsSnapshot || "", order.requiredDate || "",
    order.assignedToUserId || "", order.currency || "PHP", order.orderStatus || "DRAFT",
    order.fulfillmentStatus || "UNFULFILLED", order.subtotalExTax || 0, order.discountTotal || 0,
    order.taxTotal || 0, order.grandTotal || 0, order.remarks || "",
    versionOverride !== undefined ? versionOverride : order.version, order.confirmedAt || "",
    order.closedAt || "", order.cancelReason || "", order.importQuality || "", order.createdAt || "",
    order.createdBy || "", order.updatedAt || "", order.updatedBy || "",
  ];
}

function itemToRow_(item) {
  return [
    item.salesOrderItemId, item.salesOrderId, item.lineNo, item.orderCategory || "", item.lineType || "PRODUCT",
    item.productId || "", item.productCodeSnapshot || "", item.productNameSnapshot || "",
    item.customerProductNameSnapshot || "", item.description || "", item.unitId || "",
    item.unitSnapshot || "", item.quantity, item.unitPrice, item.priceSource || "DEFAULT_PRICE",
    item.customerProductPriceId || "", item.quotationLineReference || "", item.discountAmount || 0,
    item.taxMode || "VAT_INCLUSIVE", item.taxRate || 0, item.subtotalExTax || 0, item.taxAmount || 0,
    item.lineTotal || 0, item.fulfilledQty || 0, item.cancelledQty || 0, item.lineStatus || "ACTIVE",
    item.priceOverrideReason || "", item.createdAt || "", item.createdBy || "", item.updatedAt || "",
    item.updatedBy || "",
  ];
}

function historyToRow_(entry) {
  return [
    entry.eventId, entry.salesOrderId, entry.salesOrderItemId || "", entry.eventType,
    entry.fromStatus || "", entry.toStatus || "", entry.changedFieldsJson || "", entry.reason || "",
    entry.commandId, entry.actorUserId || "", entry.createdAt || "",
  ];
}

function sequenceToRow_(seq) {
  return [seq.sequenceKey, seq.prefix, seq.businessYear, seq.lastNumber, seq.updatedAt];
}

function documentToRow_(doc) {
  return [
    doc.documentId, doc.salesOrderId, doc.documentType, doc.externalDocumentNo || "",
    doc.driveFileId || "", doc.externalUrl || "", doc.fileName || "", doc.mimeType || "",
    doc.orderVersion || 0, doc.generationStatus || "READY", doc.errorCode || "",
    doc.createdAt || "", doc.createdBy || "",
  ];
}

function fulfillmentToRow_(entry) {
  return [
    entry.fulfillmentId, entry.salesOrderId, entry.salesOrderItemId, entry.fulfillmentType,
    entry.sourceDocumentType || "", entry.sourceDocumentId || "", entry.sourceLineId || "",
    entry.quantity, entry.effectiveDate || "", entry.evidenceDriveFileId || "",
    entry.reversesFulfillmentId || "", entry.status || "POSTED", entry.commandId,
    entry.createdAt || "", entry.createdBy || "",
  ];
}

function linkToRow_(link) {
  return [
    link.linkId, link.salesOrderId, link.salesOrderItemId || "", link.documentType,
    link.documentId || "", link.documentLineId || "", link.linkedQty || 0,
    link.linkStatus || "LINKED", link.commandId, link.createdAt || "", link.createdBy || "",
  ];
}

function jobToRow_(job) {
  return [
    job.syncJobId, job.salesOrderId, job.orderVersion, job.destinationSpreadsheetId,
    job.destinationSheetId, job.status || "PENDING", job.attemptCount || 0,
    job.nextAttemptAt || "", job.lastErrorCode || "", job.lastErrorMessage || "",
    job.leaseToken || "", job.leaseOwner || "", job.leaseExpiresAt || "", job.createdAt || "",
    job.lastAttemptAt || "", job.syncedAt || "",
  ];
}

// ---------------------------------------------------------------------------
// Generic persistence helpers (single-command atomic transaction).
// ---------------------------------------------------------------------------
function readTabValues_(sheets, tab) {
  return sheets.getSheetByName(tab).getDataRange().getValues();
}

function appendRows_(sheets, tab, rows, width) {
  if (!rows || rows.length === 0) return;
  var sheet = sheets.getSheetByName(tab);
  var lastRow = Math.max(sheet.getLastRow(), 1);
  sheet.getRange(lastRow + 1, 1, rows.length, width).setValues(rows);
}

function upsertOrderRow_(sheets, order) {
  var matches = findRows_(sheets, TABS.orders, 0, order.salesOrderId);
  if (matches.length > 0) {
    sheets.getSheetByName(TABS.orders).getRange(matches[0].row, 1, 1, WIDTHS.orders).setValues([orderToRow_(order)]);
  } else {
    appendRows_(sheets, TABS.orders, [orderToRow_(order)], WIDTHS.orders);
  }
}
function replaceItemsForOrder_(sheets, orderId, items) {
  var tab = TABS.items;
  var sheet = sheets.getSheetByName(tab);
  var values = sheet.getDataRange().getValues();
  var kept = [];
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][1]) !== orderId) kept.push(values[i]);
  }
  var rows = items.map(itemToRow_);
  var total = kept.concat(rows);
  if (total.length === 0) {
    if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, WIDTHS.items).clear();
    return;
  }

  sheet.getRange(2, 1, total.length, WIDTHS.items).setValues(total);
  // Clear any rows that are now beyond the written block (shrinking rewrite).
  if (total.length + 1 < sheet.getMaxRows()) {
    sheet.getRange(total.length + 2, 1, sheet.getMaxRows() - total.length - 1, WIDTHS.items).clear({ contentsOnly: true });
  }
}

function appendHistory_(sheets, history) {
  if (!history || history.length === 0) return;
  appendRows_(sheets, TABS.history, history.map(historyToRow_), WIDTHS.history);
}

function sequenceState_(sheets, sequenceKey) {
  var matches = findRows_(sheets, TABS.sequences, 0, sequenceKey);
  if (matches.length > 0) {
    return { row: matches[0].row, lastNumber: Number(matches[0].values[3] || 0) };
  }
  return { row: -1, lastNumber: 0 };
}

function allocateSequenceNumber_(sheets, businessYear, commandId) {
  var prefix = "AIC-SO";
  var sequenceKey = prefix + "-" + businessYear;
  var state = sequenceState_(sheets, sequenceKey);
  var next = state.lastNumber + 1;
  var display = prefix + "-" + businessYear + "-" + String(next).padStart(4, "0");
  var updatedAt = new Date().toISOString();
  if (state.row < 0) {
    appendRows_(sheets, TABS.sequences, [[sequenceKey, prefix, businessYear, next, updatedAt]], WIDTHS.sequences);
  } else {
    sheets.getSheetByName(TABS.sequences).getRange(state.row, 4, 1, 2).setValues([[next, updatedAt]]);
  }
  return display;
}

function upsertSyncJobRow_(sheets, job) {
  var tab = TABS.syncJobs;
  var matches = findRows_(sheets, tab, 0, job.syncJobId);
  if (matches.length > 0) {
    sheets.getSheetByName(tab).getRange(matches[0].row, 1, 1, WIDTHS.syncJobs).setValues([jobToRow_(job)]);
  } else {
    appendRows_(sheets, tab, [jobToRow_(job)], WIDTHS.syncJobs);
  }
}

function requireNoExistingOrder_(sheets, salesOrderId) {
  if (findRows_(sheets, TABS.orders, 0, salesOrderId).length > 0) {
    throw new Error("SalesOrder already exists; a create command cannot target an existing order.");
  }
}

function requireExistingOrder_(sheets, salesOrderId, expectedVersion) {
  var matches = findRows_(sheets, TABS.orders, 0, salesOrderId);
  if (matches.length === 0) throw new Error("SalesOrder not found.");
  var currentVersion = Number(matches[0].values[26] || 0);
  if (expectedVersion !== null && expectedVersion !== undefined && Number(expectedVersion) !== currentVersion) {
    var conflict = { ok: false, code: "VERSION_CONFLICT", currentVersion: currentVersion, status: 409 };
    var error = new Error("Version conflict: the order changed since it was loaded.");
    error.conflict = conflict;
    throw error;
  }
  return { row: matches[0].row, currentVersion: currentVersion };
}

function conflictBody_(error) {
  if (error && error.conflict) return error.conflict;
  return null;
}

function applyCreate_(sheets, envelope, payload) {
  var order = payload.order;
  if (!order || !order.salesOrderId) throw new Error("payload.order is required for so.create.");
  requireNoExistingOrder_(sheets, order.salesOrderId);
  var items = payload.items || [];
  if (items.length === 0) throw new Error("An order requires at least one line.");
  var nextVersion = Number(order.version || 1);
  upsertOrderRow_(sheets, order);
  replaceItemsForOrder_(sheets, order.salesOrderId, items);
  appendHistory_(sheets, payload.history || []);
  return { result: { salesOrderId: order.salesOrderId, version: nextVersion, salesOrderNo: "", applied: true }, conflict: null };
}

function applyUpdate_(sheets, envelope, payload) {
  var order = payload.order;
  var state = requireExistingOrder_(sheets, order.salesOrderId, envelope.expectedVersion);
  var hadItems = payload.hadItems === true;
  var nextVersion = state.currentVersion + 1;
  var next = Object.assign({}, order, { version: nextVersion, updatedAt: new Date().toISOString(), updatedBy: envelope.actorUserId });
  upsertOrderRow_(sheets, next);
  if (hadItems) replaceItemsForOrder_(sheets, order.salesOrderId, payload.items || []);
  appendHistory_(sheets, payload.history || []);
  enqueueOrder_(sheets, next);
  return { result: { salesOrderId: order.salesOrderId, version: nextVersion, salesOrderNo: order.salesOrderNo || "", applied: true }, conflict: null };
}

function applyHeaderMutation_(sheets, envelope, payload) {
  var order = payload.order;
  var state = requireExistingOrder_(sheets, order.salesOrderId, envelope.expectedVersion);
  var displayNumber = "";
  if (envelope.commandType === "so.confirm") {
    displayNumber = allocateSequenceNumber_(sheets, String(payload.receivedDate || order.receivedDate || "").slice(0, 4), envelope.commandId);
  }
  var nextVersion = state.currentVersion + 1;
  var next = Object.assign({}, order, {
    version: nextVersion,
    salesOrderNo: displayNumber || order.salesOrderNo || "",
    confirmedAt: envelope.commandType === "so.confirm" ? new Date().toISOString() : order.confirmedAt,
    updatedAt: new Date().toISOString(), updatedBy: envelope.actorUserId,
  });
  upsertOrderRow_(sheets, next);
  replaceItemsForOrder_(sheets, order.salesOrderId, payload.items || []);
  appendHistory_(sheets, payload.history || []);
  enqueueOrder_(sheets, next);
  return { result: { salesOrderId: order.salesOrderId, version: nextVersion, salesOrderNo: next.salesOrderNo, applied: true }, conflict: null };
}
function applyFulfill_(sheets, envelope, payload) {
  var order = payload.order;
  var state = requireExistingOrder_(sheets, order.salesOrderId, envelope.expectedVersion);
  var nextVersion = state.currentVersion + 1;
  var next = Object.assign({}, order, { version: nextVersion, updatedAt: new Date().toISOString(), updatedBy: envelope.actorUserId });
  upsertOrderRow_(sheets, next);
  replaceItemsForOrder_(sheets, order.salesOrderId, payload.items || []);
  if (payload.fulfillments && payload.fulfillments.length > 0) {
    appendRows_(sheets, TABS.fulfillments, payload.fulfillments.map(fulfillmentToRow_), WIDTHS.fulfillments);
  }
  appendHistory_(sheets, payload.history || []);
  enqueueOrder_(sheets, next);
  return { result: { salesOrderId: order.salesOrderId, version: nextVersion, applied: true }, conflict: null };
}

function applyAttach_(sheets, envelope, payload) {
  var doc = payload.document;
  if (!doc || !doc.documentId) throw new Error("payload.document is required for so.attach.");
  var matches = findRows_(sheets, TABS.orders, 0, payload.salesOrderId);
  if (matches.length === 0) throw new Error("SalesOrder not found.");
  var expectedVersion = envelope.expectedVersion;
  var currentVersion = Number(matches[0].values[26] || 0);
  if (expectedVersion !== null && expectedVersion !== undefined && Number(expectedVersion) !== currentVersion) {
    var conflict = { ok: false, code: "VERSION_CONFLICT", currentVersion: currentVersion, status: 409 };
    var error = new Error("Version conflict: the order changed since it was loaded.");
    error.conflict = conflict;
    throw error;
  }
  appendRows_(sheets, TABS.documents, [documentToRow_(doc)], WIDTHS.documents);
  appendHistory_(sheets, payload.history || []);
  return { result: { salesOrderId: payload.salesOrderId, version: currentVersion, documentId: doc.documentId, document: doc, applied: true }, conflict: null };
}

function applyDocumentLink_(sheets, envelope, payload) {
  var links = payload.links || [];
  if (links.length === 0) throw new Error("payload.links is required for so.documents.link.");
  var matches = findRows_(sheets, TABS.orders, 0, payload.salesOrderId);
  if (matches.length === 0) throw new Error("SalesOrder not found.");
  var expectedVersion = envelope.expectedVersion;
  var currentVersion = Number(matches[0].values[26] || 0);
  if (expectedVersion !== null && expectedVersion !== undefined && Number(expectedVersion) !== currentVersion) {
    var linkConflict = { ok: false, code: "VERSION_CONFLICT", currentVersion: currentVersion, status: 409 };
    var linkError = new Error("Version conflict: the order changed since it was loaded.");
    linkError.conflict = linkConflict;
    throw linkError;
  }
  appendRows_(sheets, TABS.documentLinks, links.map(linkToRow_), WIDTHS.documentLinks);
  appendHistory_(sheets, payload.history || []);
  return { result: { salesOrderId: payload.salesOrderId, version: currentVersion, linkCount: links.length, links: links, applied: true }, conflict: null };
}
// ---------------------------------------------------------------------------
// Outbound synchronization worker commands (claim / complete / retry).
// The destination publication for a claim happens HERE, inside the script
// lock, so two workers can never publish the same job concurrently. The claim
// is flushed to the source first; if the process dies after publishing but
// before so.sync.complete, the expired lease returns the job to RETRY and the
// next claimant reconciles by SalesOrderItemId (row hints) instead of
// appending, so a published-then-acknowledgment-failed job never duplicates
// destination rows.
// ---------------------------------------------------------------------------
function syncEnv_() {
  var props = properties_();
  var env = String(props.getProperty("SYNC_ENV") || "").trim().toLowerCase();
  if (env === "staging") return "staging";
  if (env === "live" && props.getProperty("SYNC_ALLOW_LIVE") === "1") return "live";
  return "off";
}

function applySyncClaim_(sheets, envelope, payload) {
  if (syncEnv_() === "off") throw new Error("Synchronization is not enabled for this gateway environment.");
  var job = payload.job;
  if (!job || !job.syncJobId) throw new Error("payload.job is required for so.sync.claim.");
  var tab = TABS.syncJobs;
  var matches = findRows_(sheets, tab, 0, job.syncJobId);
  if (matches.length === 0) throw new Error("Sync job not found: " + job.syncJobId);
  var current = matches[0];
  var jobRow = current.values;
  var nowIso = new Date().toISOString();
  var status = String(jobRow[5] || "PENDING");
  var existingToken = String(jobRow[10] || "");
  if (status === "SYNCED" || status === "FAILED" || status === "SUPERSEDED") {
    throw new Error("Job " + job.syncJobId + " is in terminal state " + status + " and cannot be claimed.");
  }
  if (status === "PROCESSING" && existingToken && isDatetime_(String(jobRow[12])) &&
      Date.parse(jobRow[12]) > Date.parse(nowIso) && jobRow[10] !== payload.leaseToken) {
    throw new Error("Job " + job.syncJobId + " is already claimed by lease " + existingToken + "; stale worker rejected.");
  }
  var destination = payload.destination;
  if (!destination || !destination.spreadsheetId || !destination.sheetId) {
    throw new Error("payload.destination is required for so.sync.claim.");
  }
  var props = properties_();
  var expectedDest = props.getProperty("DESTINATION_SPREADSHEET_ID");
  if (expectedDest && destination.spreadsheetId !== expectedDest) {
    throw new Error("Claim destination does not match the configured DESTINATION_SPREADSHEET_ID.");
  }
  if (String(jobRow[3]) !== destination.spreadsheetId || String(jobRow[4]) !== String(destination.sheetId) ||
      String(props.getProperty("DESTINATION_SHEET_ID")) !== String(destination.sheetId)) throw new Error("Destination mismatch.");
  var orderId = String(jobRow[1]);
  var sourceOrder = findRows_(sheets, TABS.orders, 0, orderId)[0];
  if (!sourceOrder) throw new Error("Source order missing.");
  var sourceVersion = Number(sourceOrder.values[26]);
  if (["LEGACY_UNVERIFIED", "REVIEW_REQUIRED"].indexOf(String(sourceOrder.values[30])) >= 0) throw new Error("Migration review required.");
  var rows = buildDestinationRowsFromSource_(sheets, orderId);
  var hash = payloadHash_(rows.map(function (entry) { return entry.row; }));
  var leaseExpires = new Date(Date.parse(nowIso) + LEASE_VALID_SECONDS * 1000).toISOString();
  var attemptCount = Number(jobRow[6] || 0) + 1;
  var nextJobRow = jobRow.slice();
  nextJobRow[2] = sourceVersion;
  nextJobRow[5] = "PROCESSING"; nextJobRow[6] = attemptCount;
  nextJobRow[7] = nowIso; nextJobRow[8] = ""; nextJobRow[9] = "";
  nextJobRow[10] = payload.leaseToken || ""; nextJobRow[11] = payload.leaseOwner || "worker-drain";
  nextJobRow[12] = leaseExpires; nextJobRow[14] = nowIso;
  sheets.getSheetByName(tab).getRange(current.row, 1, 1, WIDTHS.syncJobs).setValues([nextJobRow]);
  sheets.commit(); // Durable lease before the separate destination transaction.
  // Destination publication is serialized under this lock.
  var publishError = null;
  var publishedByName = {};
  if (rows.length > 0 && destination) {
    try {
      publishedByName = publishDestinationRows_(destination, rows, orderId, sourceVersion, sheets);
    } catch (error) {
      publishError = String(error && error.message ? error.message : error);
    }
  }
  var claimed;
  if (publishError) {
    var failPermanently = String(publishError).indexOf("PERMISSION") === 0 || String(publishError).indexOf("NOT_FOUND") === 0;
    var retryRow = nextJobRow.slice();
    if (failPermanently) {
      retryRow[5] = "FAILED"; retryRow[8] = "PERMISSION_DENIED"; retryRow[9] = String(publishError).slice(0, 400);
      retryRow[10] = ""; retryRow[11] = ""; retryRow[12] = ""; retryRow[15] = "";
    } else {
      var delay = Math.min(3600000, 60000 * Math.pow(2, Math.max(0, attemptCount - 1)));
      retryRow[5] = "RETRY"; retryRow[8] = "PUBLISH_FAILED"; retryRow[9] = String(publishError).slice(0, 400);
      retryRow[10] = ""; retryRow[11] = ""; retryRow[12] = "";
      retryRow[7] = new Date(Date.parse(nowIso) + delay).toISOString();
    }
    sheets.getSheetByName(tab).getRange(current.row, 1, 1, WIDTHS.syncJobs).setValues([retryRow]);
    claimed = { syncJobId: job.syncJobId, leaseToken: "", leaseExpiresAt: "", published: false, errorCode: retryRow[8], retryable: !failPermanently };
  } else {
    claimed = { syncJobId: job.syncJobId, leaseToken: payload.leaseToken || "", leaseExpiresAt: leaseExpires, published: rows.length > 0, rowHints: publishedByName, hash: hash };
  }
  return { result: claimed, conflict: null };
}
function isDatetime_(value) {
  return value.length > 0 && !Number.isNaN(Date.parse(value));
}

function applySyncComplete_(sheets, envelope, payload) {
  var job = payload.job || {};
  var tab = TABS.syncJobs;
  var matches = findRows_(sheets, tab, 0, job.syncJobId);
  if (matches.length === 0) throw new Error("Sync job not found: " + job.syncJobId);
  var current = matches[0];
  var jobRow = current.values;
  var nowIso = new Date().toISOString();
  if (String(jobRow[5]) !== "PROCESSING") throw new Error("Job " + job.syncJobId + " is not PROCESSING; cannot complete.");
  if (String(jobRow[10]) !== String(payload.leaseToken || "")) {
    throw new Error("Lease validation failed: the completion token does not match the claim.");
  }
  if (!isDatetime_(String(jobRow[12])) || Date.parse(jobRow[12]) <= Date.parse(nowIso)) {
    throw new Error("Lease expired before source acknowledgment; the job must be re-claimed.");
  }
  var verified = verifyPublication_(sheets, jobRow);
  var nextJobRow = jobRow.slice();
  nextJobRow[5] = "SYNCED"; nextJobRow[8] = ""; nextJobRow[9] = "";
  nextJobRow[10] = ""; nextJobRow[11] = ""; nextJobRow[12] = ""; nextJobRow[7] = "";
  nextJobRow[15] = nowIso;
  sheets.getSheetByName(tab).getRange(current.row, 1, 1, WIDTHS.syncJobs).setValues([nextJobRow]);
  var hints = verified.hints;
  var hash = verified.hash;
  var nowCol = new Date().toISOString();
  var has = Object.prototype.hasOwnProperty;
  for (var itemId in hints) {
    if (!has.call(hints, itemId)) continue;
    var mapRow = [
      String(jobRow[3]), String(jobRow[4]), itemId,
      String(jobRow[1]), hints[itemId],
      Number(jobRow[2]), hash, nowCol,
    ];
    var mapTab = TABS.syncMap;
    var mapMatches = findRows_(sheets, mapTab, 2, itemId);
    if (mapMatches.length > 0) {
      sheets.getSheetByName(mapTab).getRange(mapMatches[0].row, 1, 1, WIDTHS.syncMap).setValues([mapRow]);
    } else {
      appendRows_(sheets, mapTab, [mapRow], WIDTHS.syncMap);
    }
  }
  return { result: { synced: true, salesOrderId: payload.salesOrderId || job.salesOrderId || "" }, conflict: null };
}

function applySyncRetry_(sheets, envelope, payload) {
  var job = payload.job || {};
  var tab = TABS.syncJobs;
  var matches;
  if (job.syncJobId) {
    matches = findRows_(sheets, tab, 0, job.syncJobId);
  } else {
    // Manual retry without an explicit job id targets the newest non-terminal
    // job for the order (highest version, latest created).
    var all = readTabValues_(sheets, tab);
    var candidates = [];
    for (var c = 1; c < all.length; c++) {
      if (String(all[c][1]) === String(payload.salesOrderId || "")) candidates.push({ row: c + 1, values: all[c] });
    }
    candidates.sort(function (a, b) {
      return String(b.values[0]).localeCompare(String(a.values[0]));
    });
    for (var s = 0; s < candidates.length; s++) {
      if (String(candidates[s].values[5]) !== "SYNCED" && String(candidates[s].values[5]) !== "FAILED" &&
          String(candidates[s].values[5]) !== "SUPERSEDED") {
        matches = [candidates[s]];
        break;
      }
    }
    if (!matches) throw new Error("No retryable sync job found for order " + payload.salesOrderId + ".");
  }
  if (matches.length === 0) throw new Error("Sync job not found: " + job.syncJobId);
  var current = matches[0];
  var jobRow = current.values;
  var nowIso = new Date().toISOString();
  var status = String(jobRow[5]);
  if (status === "SYNCED" || status === "FAILED" || status === "SUPERSEDED") {
    throw new Error("Job " + job.syncJobId + " is in terminal state " + status + "; it cannot be retried.");
  }
  if (status === "PROCESSING" && String(jobRow[10]) && isDatetime_(String(jobRow[12])) &&
      Date.parse(jobRow[12]) > Date.parse(nowIso)) {
    throw new Error("Job " + job.syncJobId + " has a live lease; stale retry rejected.");
  }
  var nextRow = jobRow.slice();
  nextRow[5] = "RETRY"; nextRow[8] = ""; nextRow[9] = ""; nextRow[7] = nowIso;
  nextRow[10] = ""; nextRow[11] = ""; nextRow[12] = "";
  sheets.getSheetByName(tab).getRange(current.row, 1, 1, WIDTHS.syncJobs).setValues([nextRow]);
  return { result: { queued: true, salesOrderId: payload.salesOrderId || job.salesOrderId || "" }, conflict: null };
}
// ---------------------------------------------------------------------------
// Destination publication.
// The application owns columns A–T (entry + app technical IDs/version/hash)
// plus U (assignee projection) and V (fulfillment projection). External
// workflow columns and formula columns (inventory Q–S, delivery T, W aging)
// are NEVER written: only the cells this order publishes are updated, so user
// sorts and formulas stay intact. Rows are keyed by SalesOrderItemId (column
// R) for idempotent upserts — a retried claim reconciles instead of appending.
// ---------------------------------------------------------------------------
var APP_HEADERS = ["AppSalesOrderId", "AppSalesOrderItemId", "AppOrderVersion", "AppSyncedAt",
  "AppLineStatus", "AppOrderStatus", "AppFulfillmentStatus", "AppPayloadHash"];
function destinationLayout_(destination) {
  var tx = transaction_(destination.spreadsheetId);
  var sheet = tx.getSheetById(Number(destination.sheetId));
  if (!sheet) throw new Error("NOT_FOUND: configured destination sheet missing.");
  var headers = sheet.getDataRange().getValues()[0];
  var start = headers.indexOf(APP_HEADERS[0]);
  if (start < 23 || APP_HEADERS.some(function (h, i) { return headers[start + i] !== h; }))
    throw new Error("SCHEMA: provision reviewed technical columns after W before enabling sync.");
  return { tx: tx, sheet: sheet, start: start };
}
function ownedRow_(row, start) { return row.slice(0, 16).concat(row.slice(20, 22), row.slice(start, start + 3), row.slice(start + 4, start + 7)); }
function assertDestinationIntegrity_(row, start) {
  if (!row[start + 7] || payloadHash_(ownedRow_(row, start)) !== row[start + 7]) throw new Error("CONFLICT: destination app-owned values changed.");
}
function publishDestinationRows_(destination, rows, salesOrderId, version, source) {
  var layout = destinationLayout_(destination), sheet = layout.sheet, start = layout.start;
  var values = sheet.getDataRange().getValues(), index = {}, hints = {};
  for (var i = 1; i < values.length; i++) {
    var key = String(values[i][start + 1] || "");
    if (key && index[key]) throw new Error("CONFLICT: duplicate destination line ID.");
    if (key) index[key] = i + 1;
  }
  var maps = findRows_(source, TABS.importMap, 6, salesOrderId);
  var order = findRows_(source, TABS.orders, 0, salesOrderId)[0].values;
  var migrated = Boolean(order[2]) || maps.length > 0;
  var nextRow = sheet.getLastRow() + 1;
  rows.forEach(function (entry) {
    var row = entry.row, id = String(row[19]); // payload layout: A:P, U:V, eight metadata fields
    var target = index[id];
    if (migrated && (!target || !maps.some(function (m) { return String(m.values[7]) === id && String(m.values[9]) === "REVIEWED"; })))
      throw new Error("MIGRATION: reviewed map and destination ID backfill required.");
    if (target) {
      var existing = values[target - 1];
      if (String(existing[start]) !== salesOrderId) throw new Error("CONFLICT: order identity mismatch.");
      assertDestinationIntegrity_(existing, start);
      if (Number(existing[start + 2]) > version) throw new Error("CONFLICT: refusing an older version.");
    } else { target = nextRow++; }
    var meta = row.slice(18, 26);
    meta[2] = version; meta[3] = new Date().toISOString();
    meta[7] = payloadHash_(row.slice(0, 18).concat(meta.slice(0, 3), meta.slice(4, 7)));
    sheet.getRange(target, 1, 1, 16).setValues([row.slice(0, 16)]);
    sheet.getRange(target, 21, 1, 2).setValues([row.slice(16, 18)]);
    sheet.getRange(target, start + 1, 1, 8).setValues([meta]);
    hints[id] = target;
  });
  layout.tx.commit(); // One destination batch; source acknowledgment is separate.
  return hints;
}
function verifyPublication_(source, jobRow) {
  var layout = destinationLayout_({ spreadsheetId: String(jobRow[3]), sheetId: String(jobRow[4]) });
  var values = layout.sheet.getDataRange().getValues(), start = layout.start, hints = {}, hashes = [];
  values.slice(1).forEach(function (row, i) {
    if (String(row[start]) !== String(jobRow[1])) return;
    assertDestinationIntegrity_(row, start);
    if (Number(row[start + 2]) < Number(jobRow[2])) throw new Error("Destination version is not published.");
    var id = String(row[start + 1]);
    if (hints[id]) throw new Error("Duplicate destination key.");
    hints[id] = i + 2; hashes.push(row[start + 7]);
  });
  findRows_(source, TABS.items, 1, String(jobRow[1])).forEach(function (item) {
    if (!hints[String(item.values[0])]) throw new Error("Destination line missing; cannot acknowledge.");
  });
  return { hints: hints, hash: payloadHash_(hashes.sort()) };
}

/** Builds destination rows from the SOURCE state (mirrors syncWorker.buildDestinationRows). */
function buildDestinationRowsFromSource_(sheets, salesOrderId) {
  var orderRow = findRows_(sheets, TABS.orders, 0, salesOrderId);
  if (orderRow.length === 0) throw new Error("SalesOrder not found: " + salesOrderId);
  var order = orderRow[0].values;
  var itemRows = findRows_(sheets, TABS.items, 1, salesOrderId);
  var rows = [];
  for (var i = 0; i < itemRows.length; i++) {
    var item = itemRows[i].values;

    var qty = item[12] === null || item[12] === undefined || String(item[12]) === "" ? 0 : Number(item[12]);
    var fulfilled = Math.max(0, Number(item[23] || 0));
    var cancelled = Math.max(0, Number(item[24] || 0));
    var remaining = Math.max(0, qty - cancelled - fulfilled);
    var projection = qty > 0 && fulfilled >= qty && cancelled === 0 ? "Completed" : "Pending";
    var lineTotal = item[22] === null || item[22] === undefined ? 0 : Number(item[22]);
    rows.push({
      row: [
        String(order[2] || "") || String(order[1] || ""), // A tracker no or sales order no
        String(order[3] || ""),                           // B received date
        String(item[3] || ""),                            // C category
        String(order[12] || ""),                          // D customer PO
        String(order[5] || ""),                           // E customer
        String(order[25] || ""),                          // F remarks
        String(item[6] || ""),                            // G SKU
        String(item[7] || item[9] || ""),                 // H product name
        String(item[9] || ""),                            // I description
        qty === 0 ? "" : qty,                             // J quantity (blank stays blank)
        item[13] === null || item[13] === undefined || String(item[13]) === "" ? "" : Number(item[13]), // K unit price
        Number(item[17] || 0),                            // L discount
        item[21] === undefined ? "" : item[21],             // M tax snapshot
        lineTotal,                                        // N line total
        "",                                               // O customer PO document link
        "",                                               // P quotation link
        String(order[17] || ""), projection, // U:V (mapped separately)
        String(order[0]), String(item[0]), Number(order[26]), "",
        String(item[25]), String(order[19]), String(order[20]), "",
      ],
      salesOrderItemId: String(item[0] || ""),
      lineTotal: lineTotal,
    });
  }
  return rows;
}
/**
 * Time-triggered durable worker — claims due jobs inside the same lock that
 * guards all writes. Never publishes to a live destination unless the gateway
 * environment authorizes it (SYNC_ENV=staging, or live with SYNC_ALLOW_LIVE=1).
 */
function processDueJobs_() {
  var props = properties_();
  var configuredDestination = props.getProperty("DESTINATION_SPREADSHEET_ID");
  var destinationSheetId = props.getProperty("DESTINATION_SHEET_ID");
  if (syncEnv_() === "off" || !configuredDestination || !destinationSheetId) {
    return { processed: 0, blocked: ["synchronization environment/destination not configured"] };
  }
  var sourceSpreadsheetId = props.getProperty("SOURCE_SPREADSHEET_ID");
  return withOrderLock_("worker", function () {
    var sheets = transaction_(sourceSpreadsheetId);
    var jobValues = sheets.getSheetByName(TABS.syncJobs).getDataRange().getValues();
    var nowIso = new Date().toISOString();
    var destination = { spreadsheetId: configuredDestination, sheetId: destinationSheetId };
    var processed = 0;
    var blocked = [];
    // 1. Recover expired leases (crash recovery) and write them back.
    for (var i = 1; i < jobValues.length; i++) {
      var jobRow = jobValues[i];
      if (String(jobRow[5]) === "PROCESSING" && String(jobRow[10]) && isDatetime_(String(jobRow[12])) &&
          Date.parse(jobRow[12]) <= Date.parse(nowIso)) {
        jobRow[5] = "RETRY"; jobRow[8] = "LEASE_EXPIRED";
        jobRow[9] = "The processing lease expired before completion; the job was returned to retry.";
        jobRow[10] = ""; jobRow[11] = ""; jobRow[12] = ""; jobRow[7] = nowIso;
        sheets.getSheetByName(TABS.syncJobs).getRange(i + 1, 1, 1, WIDTHS.syncJobs).setValues([jobRow]);
      }
    }
    // 2. Claim + publish + acknowledge each due job.
    for (var j = 1; j < jobValues.length; j++) {
      var row = jobValues[j];
      var jobId = String(row[0] || "");
      if (!jobId) continue;
      var status = String(row[5] || "PENDING");
      if (status !== "PENDING" && status !== "RETRY") continue;
      if (String(row[3]) !== destination.spreadsheetId || String(row[4]) !== destination.sheetId) continue;
      if (row[7] && isDatetime_(String(row[7])) && Date.parse(row[7]) > Date.parse(nowIso)) continue;
      var salesOrderId = String(row[1] || "");
      var orderRow = findRows_(sheets, TABS.orders, 0, salesOrderId);
      if (orderRow.length === 0) { blocked.push(jobId + ": missing order " + salesOrderId); continue; }
      if (String(orderRow[0].values[30]) === "LEGACY_UNVERIFIED" || String(orderRow[0].values[30]) === "REVIEW_REQUIRED") {
        blocked.push(jobId + ": migrated order not reviewed (importQuality " + String(orderRow[0].values[30]) + ")");
        continue;
      }
      var destinationRows = buildDestinationRowsFromSource_(sheets, salesOrderId);
      var hash = payloadHash_(destinationRows.map(function (entry) { return entry.row; }));
      var claimEnvelope = { commandId: "worker-" + Utilities.getUuid(), expectedVersion: null, actorUserId: "system-worker" };
      var leaseToken = Utilities.getUuid();
      var claimPayload = {
        job: { syncJobId: jobId, salesOrderId: salesOrderId, orderVersion: Number(row[2] || 0),
               destinationSpreadsheetId: destination.spreadsheetId, destinationSheetId: destination.sheetId, leaseToken: "" },
        destination: destination, leaseToken: leaseToken, leaseOwner: "worker-drain",
        rows: destinationRows, hash: hash,
      };
      var claimResult = applySyncClaim_(sheets, claimEnvelope, claimPayload).result;
      if (!claimResult.published) {
        blocked.push(jobId + ": publish failed (" + claimResult.errorCode + ")");
        continue;
      }
      applySyncComplete_(sheets, claimEnvelope, {
        job: { syncJobId: jobId, salesOrderId: salesOrderId, orderVersion: Number(row[2] || 0),
               destinationSpreadsheetId: destination.spreadsheetId, destinationSheetId: destination.sheetId },
        leaseToken: claimResult.leaseToken, salesOrderId: salesOrderId,
        rowHints: claimResult.rowHints, hash: claimResult.hash,
      });
      sheets.commit();
      processed += 1;
    }
    sheets.commit();
    return { processed: processed, blocked: blocked };
  });
}

/** Trigger entry point for the Apps Script time-driven trigger. */
function onWorkerTrigger() {
  var summary = processDueJobs_();
  Logger.log(JSON.stringify(summary));
  return summary;
}

function doGet() {
  return HtmlService.createHtmlOutput(
    "<p>Sales Order Writer gateway. POST a signed command envelope to use it.</p>",
  ).setTitle("Sales Order Writer");
}
