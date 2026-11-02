import type { Database } from "@/lib/supabase/database.types";
import { displayIdentifier } from "@/lib/identifiers/normalize";

type Enums = Database["public"]["Enums"];

export type ComplaintLang = "en" | "hi";

export type ComplaintData = {
  reportId: string;
  createdAt: string;
  category: Enums["scam_category"];
  channel: Enums["report_channel"];
  description: string;
  amountLost: number | null;
  incidentDate: string | null;
  paymentMethod: Enums["payment_method"] | null;
  bankAccountLast4: string | null;
  transactionRef: string | null;
  identifiers: { type: Enums["identifier_type"]; value: string }[];
  evidence: { fileName: string | null; sha256: string }[];
};

/** Translated enum labels in the complaint's language (from messages/*.json). */
export type ComplaintLabels = {
  category: Record<Enums["scam_category"], string>;
  channel: Record<Enums["report_channel"], string>;
  paymentMethod: Record<Enums["payment_method"], string>;
  identifierType: Record<Enums["identifier_type"], string>;
};

const COPY = {
  en: {
    portalSubject: "Subject: Online financial fraud – {category}",
    portalIntro: "I want to report a cyber fraud.",
    type: "Type of fraud",
    date: "Date of incident",
    notSure: "Not sure",
    contact: "How the fraudster contacted me",
    amount: "Amount lost",
    noMoney: "No money lost",
    via: "via",
    txn: "Transaction ID / UTR",
    account: "My bank account",
    endingIn: "ending in",
    fraudster: "Fraudster's details:",
    noFraudster: "I do not have the fraudster's details.",
    what: "What happened:",
    noDescription: "[Describe what happened in your own words.]",
    evidence:
      "Evidence: I have saved {count} file(s) (screenshots, recordings or documents). Their SHA-256 fingerprints are:",
    evidenceReady: "I can share these files with the investigating officer.",
    noEvidence: "Evidence: I have not saved any files yet.",
    requestMoney:
      "I request you to take action against the fraudster, freeze the accounts that received my money, and help me recover the amount.",
    requestNoMoney:
      "I request you to take action against the fraudster and block the numbers, accounts and websites listed above.",
    bankTo: "To,\nThe Branch Manager / Fraud & Disputes Team,\n[Bank name and branch]",
    bankSubject:
      "Subject: Fraudulent transaction – request to block, raise a dispute and recover funds",
    bankGreeting: "Dear Sir/Madam,",
    bankIntro:
      "I am your customer, holding the account ending in {last4}. On {date}, I was cheated by a fraudster who contacted me by {channel} ({category}). {amount} was debited from my account through {method}.",
    bankIntroNoAmount:
      "I am your customer, holding the account ending in {last4}. On {date}, I was targeted by a fraudster who contacted me by {channel} ({category}).",
    last4Placeholder: "[last 4 digits]",
    datePlaceholder: "[date]",
    methodPlaceholder: "[payment method]",
    txnPlaceholder: "[add the transaction ID / UTR from your bank SMS]",
    bankRequest: "I request you to:",
    bankSteps: [
      "Immediately block my debit/credit card, UPI and net banking access if they are at risk, and issue replacements.",
      "Register a fraud dispute for the above transaction and start recovery.",
      "Ask the beneficiary bank to freeze or hold the amount in the receiving account.",
      "Give me the complaint reference number in writing.",
    ],
    bankCyber:
      "I have reported (or will report) this on the National Cyber Crime Helpline 1930 and cybercrime.gov.in. Acknowledgement number: ____________",
    bankRbi:
      "I am reporting this fraud promptly. Please process it under the RBI circular on customer protection in unauthorised electronic banking transactions (DBR.No.Leg.BC.78/09.07.005/2017-18, dated 6 July 2017).",
    bankSign: "Yours faithfully,\n[Your full name]\n[Your mobile number]",
    reference: "Kavach report reference",
  },
  hi: {
    portalSubject: "विषय: ऑनलाइन वित्तीय धोखाधड़ी – {category}",
    portalIntro: "मैं एक साइबर धोखाधड़ी की शिकायत दर्ज करना चाहता/चाहती हूँ।",
    type: "धोखाधड़ी का प्रकार",
    date: "घटना की तारीख",
    notSure: "पक्का पता नहीं",
    contact: "धोखेबाज़ ने संपर्क कैसे किया",
    amount: "गई हुई रकम",
    noMoney: "कोई पैसा नहीं गया",
    via: "द्वारा",
    txn: "ट्रांज़ैक्शन ID / UTR",
    account: "मेरा बैंक खाता",
    endingIn: "जिसके आखिरी अंक",
    fraudster: "धोखेबाज़ की जानकारी:",
    noFraudster: "मेरे पास धोखेबाज़ की जानकारी नहीं है।",
    what: "क्या हुआ:",
    noDescription: "[अपने शब्दों में लिखें कि क्या हुआ।]",
    evidence:
      "सबूत: मैंने {count} फ़ाइल (स्क्रीनशॉट, रिकॉर्डिंग या दस्तावेज़) सँभालकर रखी हैं। उनके SHA-256 फ़िंगरप्रिंट ये हैं:",
    evidenceReady: "मैं ये फ़ाइलें जाँच अधिकारी को दे सकता/सकती हूँ।",
    noEvidence: "सबूत: मैंने अभी तक कोई फ़ाइल सेव नहीं की है।",
    requestMoney:
      "मेरा अनुरोध है कि धोखेबाज़ के खिलाफ़ कार्रवाई की जाए, जिन खातों में मेरा पैसा गया है उन्हें फ़्रीज़ किया जाए, और मेरी रकम वापस दिलाने में मदद की जाए।",
    requestNoMoney:
      "मेरा अनुरोध है कि धोखेबाज़ के खिलाफ़ कार्रवाई की जाए और ऊपर दिए गए नंबर, खाते और वेबसाइटें बंद की जाएँ।",
    bankTo: "सेवा में,\nशाखा प्रबंधक / फ्रॉड एवं डिस्प्यूट टीम,\n[बैंक का नाम और शाखा]",
    bankSubject:
      "विषय: धोखाधड़ी वाला लेन-देन – ब्लॉक करने, शिकायत दर्ज करने और पैसा वापस दिलाने का अनुरोध",
    bankGreeting: "महोदय/महोदया,",
    bankIntro:
      "मैं आपका ग्राहक हूँ और मेरे खाते के आखिरी अंक {last4} हैं। {date} को एक धोखेबाज़ ने {channel} के ज़रिए मुझसे संपर्क करके ({category}) मेरे साथ धोखाधड़ी की। मेरे खाते से {method} के ज़रिए {amount} कट गए।",
    bankIntroNoAmount:
      "मैं आपका ग्राहक हूँ और मेरे खाते के आखिरी अंक {last4} हैं। {date} को एक धोखेबाज़ ने {channel} के ज़रिए मुझसे संपर्क किया ({category})।",
    last4Placeholder: "[आखिरी 4 अंक]",
    datePlaceholder: "[तारीख]",
    methodPlaceholder: "[पेमेंट का तरीका]",
    txnPlaceholder: "[बैंक के SMS से ट्रांज़ैक्शन ID / UTR लिखें]",
    bankRequest: "मेरा अनुरोध है कि:",
    bankSteps: [
      "अगर मेरा डेबिट/क्रेडिट कार्ड, UPI और नेट बैंकिंग खतरे में हैं तो उन्हें तुरंत ब्लॉक करें और नए जारी करें।",
      "ऊपर दिए गए लेन-देन के लिए फ्रॉड शिकायत (dispute) दर्ज करें और पैसा वापस लाने की प्रक्रिया शुरू करें।",
      "पैसा पाने वाले बैंक से उस खाते में रकम फ़्रीज़ या होल्ड करवाएँ।",
      "मुझे शिकायत का रेफ़रेंस नंबर लिखित में दें।",
    ],
    bankCyber:
      "मैंने इसकी शिकायत राष्ट्रीय साइबर अपराध हेल्पलाइन 1930 और cybercrime.gov.in पर कर दी है (या करूँगा/करूँगी)। Acknowledgement नंबर: ____________",
    bankRbi:
      "मैं इस धोखाधड़ी की जानकारी तुरंत दे रहा/रही हूँ। कृपया इसे बिना अनुमति के हुए इलेक्ट्रॉनिक बैंकिंग लेन-देन में ग्राहक सुरक्षा पर RBI के परिपत्र (DBR.No.Leg.BC.78/09.07.005/2017-18, दिनांक 6 जुलाई 2017) के तहत निपटाएँ।",
    bankSign: "भवदीय,\n[आपका पूरा नाम]\n[आपका मोबाइल नंबर]",
    reference: "Kavach रिपोर्ट रेफ़रेंस",
  },
} as const;

const fill = (tpl: string, vars: Record<string, string | number>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

export function formatInr(amount: number, lang: ComplaintLang): string {
  return new Intl.NumberFormat(lang === "hi" ? "hi-IN" : "en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(iso: string, lang: ComplaintLang): string {
  return new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso.length === 10 ? `${iso}T00:00:00+05:30` : iso));
}

/** Drop a domain entry when a URL on that domain is already listed. */
function visibleIdentifiers(ids: ComplaintData["identifiers"]) {
  const urls = ids.filter((i) => i.type === "url").map((i) => i.value);
  return ids.filter(
    (i) =>
      i.type !== "domain" ||
      !urls.some((u) => u.startsWith(`https://${i.value}`) || u.includes(`.${i.value}`)),
  );
}

function fraudsterLines(d: ComplaintData, lang: ComplaintLang, labels: ComplaintLabels): string[] {
  const c = COPY[lang];
  const ids = visibleIdentifiers(d.identifiers);
  if (ids.length === 0) return [c.noFraudster];
  return [
    c.fraudster,
    ...ids.map((i) => `- ${labels.identifierType[i.type]}: ${displayIdentifier(i.type, i.value)}`),
  ];
}

function evidenceLines(d: ComplaintData, lang: ComplaintLang): string[] {
  const c = COPY[lang];
  if (d.evidence.length === 0) return [c.noEvidence];
  return [
    fill(c.evidence, { count: d.evidence.length }),
    ...d.evidence.map((e, i) => `${i + 1}. ${e.fileName ?? "file"} – ${e.sha256}`),
    c.evidenceReady,
  ];
}

const lostMoney = (d: ComplaintData) => d.amountLost !== null && d.amountLost > 0;

/** Text to paste into the incident details box on cybercrime.gov.in. */
export function buildPortalComplaint(
  d: ComplaintData,
  lang: ComplaintLang,
  labels: ComplaintLabels,
): string {
  const c = COPY[lang];
  const facts = [
    `${c.type}: ${labels.category[d.category]}`,
    `${c.date}: ${d.incidentDate ? formatDate(d.incidentDate, lang) : c.notSure}`,
    `${c.contact}: ${labels.channel[d.channel]}`,
    `${c.amount}: ${
      lostMoney(d)
        ? `${formatInr(d.amountLost!, lang)}${d.paymentMethod ? ` ${c.via} ${labels.paymentMethod[d.paymentMethod]}` : ""}`
        : c.noMoney
    }`,
    ...(d.transactionRef ? [`${c.txn}: ${d.transactionRef}`] : []),
    ...(d.bankAccountLast4 ? [`${c.account}: ${c.endingIn} ${d.bankAccountLast4}`] : []),
  ];

  return [
    fill(c.portalSubject, { category: labels.category[d.category] }),
    "",
    c.portalIntro,
    "",
    ...facts,
    "",
    ...fraudsterLines(d, lang, labels),
    "",
    c.what,
    d.description.trim() || c.noDescription,
    "",
    ...evidenceLines(d, lang),
    "",
    lostMoney(d) ? c.requestMoney : c.requestNoMoney,
    "",
    `${c.reference}: ${d.reportId.slice(0, 8).toUpperCase()}`,
  ].join("\n");
}

/** Letter / email to the victim's bank. */
export function buildBankLetter(
  d: ComplaintData,
  lang: ComplaintLang,
  labels: ComplaintLabels,
): string {
  const c = COPY[lang];
  const vars = {
    last4: d.bankAccountLast4 ?? c.last4Placeholder,
    date: d.incidentDate ? formatDate(d.incidentDate, lang) : c.datePlaceholder,
    channel: labels.channel[d.channel],
    category: labels.category[d.category],
    amount: lostMoney(d) ? formatInr(d.amountLost!, lang) : "",
    method: d.paymentMethod ? labels.paymentMethod[d.paymentMethod] : c.methodPlaceholder,
  };

  return [
    c.bankTo,
    "",
    c.bankSubject,
    "",
    c.bankGreeting,
    "",
    fill(lostMoney(d) ? c.bankIntro : c.bankIntroNoAmount, vars),
    "",
    `${c.txn}: ${d.transactionRef ?? c.txnPlaceholder}`,
    ...fraudsterLines(d, lang, labels),
    "",
    c.bankRequest,
    ...c.bankSteps.map((s, i) => `${i + 1}. ${s}`),
    "",
    c.bankCyber,
    "",
    c.bankRbi,
    "",
    `${c.reference}: ${d.reportId.slice(0, 8).toUpperCase()}`,
    "",
    c.bankSign,
  ].join("\n");
}
