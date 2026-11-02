/** Plain data for the PDF (built on the server, English labels). */
export type PdfData = {
  reference: string;
  createdAt: string;
  generatedAt: string;
  rows: [label: string, value: string][];
  identifiers: string[];
  description: string;
  evidence: { name: string; size: string; sha256: string }[];
  portalText: string;
};
