import { Document, Font, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { PdfData } from "./pdf-types";

// Loaded only when the user taps "Download PDF" (dynamic import), so this
// library and its fonts never weigh down normal page loads.
let fontsRegistered = false;
function registerFonts() {
  if (fontsRegistered) return;
  const base = `${window.location.origin}/fonts`;
  Font.register({
    family: "NotoSans",
    fonts: [
      { src: `${base}/noto-sans-latin-400-normal.woff` },
      { src: `${base}/noto-sans-latin-700-normal.woff`, fontWeight: 700 },
    ],
  });
  // Fallback for Devanagari (Hindi descriptions) and the ₹ sign.
  Font.register({
    family: "NotoDeva",
    fonts: [
      { src: `${base}/noto-sans-devanagari-devanagari-400-normal.woff` },
      { src: `${base}/noto-sans-devanagari-devanagari-700-normal.woff`, fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

const s = StyleSheet.create({
  page: {
    padding: 36,
    paddingBottom: 48,
    fontFamily: ["NotoSans", "NotoDeva"],
    fontSize: 10,
    lineHeight: 1.45,
    color: "#111827",
  },
  title: { fontSize: 18, fontWeight: 700, color: "#1e3a8a", lineHeight: 1.3, marginBottom: 2 },
  meta: { marginTop: 2, color: "#4b5563" },
  note: { marginTop: 10, padding: 8, backgroundColor: "#f3f4f6", fontSize: 9 },
  h2: { marginTop: 16, marginBottom: 6, fontSize: 12, fontWeight: 700, color: "#1e3a8a" },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
    paddingVertical: 3,
  },
  label: { width: "38%", color: "#4b5563" },
  value: { width: "62%" },
  ev: { borderBottomWidth: 0.5, borderBottomColor: "#e5e7eb", paddingVertical: 4 },
  hash: { fontSize: 8, color: "#374151" },
  pre: { padding: 8, borderWidth: 0.5, borderColor: "#d1d5db" },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    fontSize: 8,
    color: "#6b7280",
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

function ReportDocument({ d }: { d: PdfData }) {
  return (
    <Document
      title={`Kavach incident summary ${d.reference}`}
      author="Kavach user"
      creator="Kavach"
    >
      <Page size="A4" style={s.page} wrap>
        <Text style={s.title}>Scam incident summary</Text>
        <Text style={s.meta}>
          Reference {d.reference} · Reported on {d.createdAt}
        </Text>
        <Text style={s.note}>
          Prepared by the victim using Kavach. Kavach does not verify reports and does not file
          complaints with the police or banks. File the complaint at cybercrime.gov.in or call the
          1930 helpline.
        </Text>

        <Text style={s.h2}>Incident</Text>
        {d.rows.map(([label, value]) => (
          <View key={label} style={s.row} wrap={false}>
            <Text style={s.label}>{label}</Text>
            <Text style={s.value}>{value}</Text>
          </View>
        ))}

        <Text style={s.h2}>Fraudster&apos;s details</Text>
        {d.identifiers.length ? (
          d.identifiers.map((i) => <Text key={i}>• {i}</Text>)
        ) : (
          <Text>Not known.</Text>
        )}

        <Text style={s.h2}>What happened</Text>
        <Text>{d.description || "Not described."}</Text>

        <Text style={s.h2}>Evidence ({d.evidence.length} files)</Text>
        {d.evidence.length ? (
          d.evidence.map((e, i) => (
            <View key={e.sha256 + i} style={s.ev} wrap={false}>
              <Text>
                {i + 1}. {e.name} ({e.size})
              </Text>
              <Text style={s.hash}>SHA-256: {e.sha256}</Text>
            </View>
          ))
        ) : (
          <Text>No files uploaded.</Text>
        )}

        <Text style={s.h2}>Complaint text (for cybercrime.gov.in)</Text>
        <Text style={s.pre}>{d.portalText}</Text>

        <View style={s.footer} fixed>
          <Text>Kavach · generated {d.generatedAt}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderReportPdf(d: PdfData): Promise<Blob> {
  registerFonts();
  return pdf(<ReportDocument d={d} />).toBlob();
}
