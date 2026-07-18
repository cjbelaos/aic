/**
 * Product Code Generator — Auto-generates a unique ProductCode/SKU for products.
 *
 * Product Code Structure:  [CATEGORY_CODE]-[SPEC_CODE]-[4_DIGIT_SEQUENCE]
 * Example:        "PG-PAN300-0131"  or  "FL-10SL10M-0001"
 */

/**
 * Extracts the [SPEC_CODE] block dynamically from a product description/name.
 * Ported from the exact TypeScript logic provided in the specification.
 */
export function extractSpecFromDescription(description: string): string {
  const desc = description.toUpperCase().trim();

  // 1. Check for standard Housing sizes (e.g., 10SL, 20BB, 20SL) + Micron levels
  const sizeMatch = desc.match(/^(\d+[A-Z]{2})\s+(X?\d+M)/);
  if (sizeMatch) {
    return `${sizeMatch[1]}${sizeMatch[2].replace("X", "")}`;
  }

  // 2. Just capture the size housing if no micron is present
  const basicSizeMatch = desc.match(/^(\d+[A-Z]{2})/);
  if (
    basicSizeMatch &&
    (desc.includes("FILTER") ||
      desc.includes("CARTRIDGE") ||
      desc.includes("CARBON") ||
      desc.includes("TANK"))
  ) {
    let suffix = "GEN";
    if (desc.includes("CARBON")) suffix = "CRB";
    if (desc.includes("EMPTY")) suffix = "EMP";
    if (desc.includes("TANK")) suffix = "TNK";
    return `${basicSizeMatch[1]}${suffix}`;
  }

  // 3. Check for Pumps / Motors with Horsepower ratings
  const hpMatch = desc.match(/(\d+\.?\d*)\s*HP/);
  if (hpMatch) {
    const modelMatch = desc.match(/(CHV|ATS|ATJ|CDLF|CDMF)/);
    const modelPrefix = modelMatch ? modelMatch[0] : "PMP";
    const hpValue = hpMatch[1].replace(".", "");
    return `${modelPrefix}${hpValue}HP`;
  }

  // 4. Check for Digital/Manual Valve Head Models
  const valveMatch = desc.match(/(F\d+[A-Z]\d+|N\d+[A-Z]\d+)/);
  if (valveMatch) {
    return valveMatch[0];
  }

  // 5. Check for FRP Tank dimensions
  const frpMatch = desc.match(/FRP TANK\s+(\d+)\s*X\s*(\d+)/);
  if (frpMatch) {
    return `FRP${frpMatch[1]}X${frpMatch[2]}`;
  }

  // 6. Check for Medical/Dialysis Machine specs
  if (desc.includes("STATION") || desc.includes("STN")) {
    const stnMatch = desc.match(/(\d+)\s*(STATION|STN)/);
    const prefix = desc.includes("AUTO") ? "AUTO" : "MAN";
    return stnMatch ? `${prefix}${stnMatch[1]}STN` : "DIALYSIS";
  }

  // 7. Fallback: Clean up the first word + numbers
  const words = desc.split(" ");
  const firstWord = words[0].substring(0, 4);
  const anyNumber = desc.match(/\d+/);
  return anyNumber ? `${firstWord}${anyNumber[0]}` : `${firstWord}GEN`;
}

/**
 * Generates a full Product Code string: [CATEGORY_CODE]-[SPEC_CODE]-[4_DIGIT_SEQUENCE]
 *
 * @param categoryCode - The short code of the product category (e.g., "PG", "FL", "CO")
 * @param description  - The product description/name used to derive the SPEC_CODE
 * @param sequence     - The sequential number (1-based) to format as 4 digits
 * @returns            - Uppercase Product Code string
 */
export function generateProductCode(
  categoryCode: string,
  description: string,
  sequence: number,
): string {
  const catCode = categoryCode.toUpperCase().trim();
  const specCode = extractSpecFromDescription(description);
  const seqPadded = String(sequence).padStart(4, "0");

  return `${catCode}-${specCode}-${seqPadded}`;
}
