import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";

const TOLL_MATRIX_SHEET = "Toll Matrix Table";

export const EXPRESSWAY_GROUPS: {
  name: string;
  startRow: number;
  endRow: number;
}[] = [
  { name: "TPLEX", startRow: 2, endRow: 12 },
  { name: "NLEX", startRow: 13, endRow: 43 },
  { name: "SLEX", startRow: 44, endRow: 59 },
  { name: "STARTOLL", startRow: 59, endRow: 66 },
  { name: "CAVITEX", startRow: 67, endRow: 70 },
  { name: "CALAX", startRow: 71, endRow: 76 },
];

/**
 * Fetch gates grouped by expressway from the Toll Matrix Table in the Database spreadsheet.
 */
export async function getExpresswayGroups(): Promise<
  { name: string; gates: string[] }[]
> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${TOLL_MATRIX_SHEET}!A:A`,
  });
  const rows = res.data.values || [];

  return EXPRESSWAY_GROUPS.map(({ name, startRow, endRow }) => {
    const gates: string[] = [];
    for (let i = startRow - 1; i < Math.min(endRow, rows.length); i++) {
      const gate = (rows[i]?.[0] || "").toString().trim();
      if (gate) gates.push(gate);
    }
    return { name, gates };
  }).filter((g) => g.gates.length > 0);
}

/**
 * Fetch the Toll Matrix from the Database spreadsheet.
 */
export async function getTollMatrix(): Promise<{
  gates: string[];
  matrix: number[][];
}> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: TOLL_MATRIX_SHEET,
  });
  const rows = res.data.values || [];
  if (rows.length < 2) {
    return { gates: [], matrix: [] };
  }

  const gates = rows[0]
    .slice(1)
    .map((g) => g.toString().trim())
    .filter(Boolean);
  const gatesLower = gates.map((g) => g.toLowerCase());

  const matrix: number[][] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const gateName = (row[0] || "").toString().trim();
    const gateIndex = gatesLower.indexOf(gateName.toLowerCase());
    if (gateIndex === -1) continue;

    const rowValues: number[] = [];
    for (let j = 0; j < gates.length; j++) {
      const cellVal = row[j + 1];
      const num = parseFloat(cellVal?.toString().trim() || "0");
      rowValues.push(isNaN(num) ? 0 : num);
    }
    matrix[gateIndex] = rowValues;
  }

  return { gates, matrix };
}

export interface TollGraph {
  gates: string[];
  matrix: number[][];
}

/**
 * Find the shortest path (minimum total fee) between two gates using Dijkstra's algorithm.
 */
export function findShortestTollFee(
  graph: TollGraph,
  entry: string,
  exit: string,
): number {
  const { gates, matrix } = graph;
  const gatesLower = gates.map((g) => g.toLowerCase());
  const startIdx = gatesLower.indexOf(entry.toLowerCase());
  const endIdx = gatesLower.indexOf(exit.toLowerCase());

  if (startIdx === -1 || endIdx === -1) return 0;
  if (startIdx === endIdx) return 0;

  const directFee = matrix[startIdx]?.[endIdx] ?? 0;
  if (directFee > 0) return directFee;

  const n = gates.length;
  const distances: number[] = new Array(n).fill(Infinity);
  const visited: boolean[] = new Array(n).fill(false);
  distances[startIdx] = 0;

  for (let count = 0; count < n - 1; count++) {
    let minDist = Infinity;
    let u = -1;
    for (let i = 0; i < n; i++) {
      if (!visited[i] && distances[i] <= minDist) {
        minDist = distances[i];
        u = i;
      }
    }
    if (u === -1 || u === endIdx) break;
    visited[u] = true;
    for (let v = 0; v < n; v++) {
      const weight = matrix[u]?.[v] ?? 0;
      if (
        !visited[v] &&
        weight > 0 &&
        distances[u] !== Infinity &&
        distances[u] + weight < distances[v]
      ) {
        distances[v] = distances[u] + weight;
      }
    }
  }
  return distances[endIdx] === Infinity ? 0 : distances[endIdx];
}

export function calculateSegmentFee(
  graph: TollGraph,
  entry: string,
  exit: string,
): number {
  return findShortestTollFee(graph, entry, exit);
}
