// Sensitive-data redaction. Applied before AI processing and, by default, in
// reports and file/evidence views. Redaction is deliberately conservative:
// it errs toward over-redacting secrets rather than leaking them.

export interface RedactionOptions {
  redactPrivateIps?: boolean; // optional toggle (PRD)
  redactInternalFqdns?: boolean; // optional toggle (PRD)
}

const MASK = "[REDACTED]";

interface Rule {
  name: string;
  regex: RegExp;
  replacer?: (match: string, ...groups: string[]) => string;
}

// Order matters: multi-line blocks (keys/certs) run first.
function buildRules(opts: RedactionOptions): Rule[] {
  const rules: Rule[] = [
    // Private keys / certificate blocks (PEM)
    {
      name: "pem-block",
      regex:
        /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?(?:PRIVATE KEY|CERTIFICATE)-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?(?:PRIVATE KEY|CERTIFICATE)-----/g,
      replacer: () => `${MASK}-PEM-BLOCK`,
    },
    // Password / secret / passphrase key=value or "key": "value" (config + json)
    {
      name: "password-kv",
      regex:
        /((?:password|passwd|pwd|secret|passphrase|pre-?shared-?key|psk|auth-?key|bind-?password|client-?secret)\s*[:=]\s*)("?)([^\s"'<>]+)(\2)/gi,
      replacer: (_m, pre, q) => `${pre}${q}${MASK}${q}`,
    },
    // XML-style <password>...</password>, <phash>, <secret>
    {
      name: "password-xml",
      regex:
        /(<(password|phash|secret|passphrase|psk|pre-shared-key|bind-password)[^>]*>)([\s\S]*?)(<\/\2>)/gi,
      replacer: (_m, open, _tag, _val, close) => `${open}${MASK}${close}`,
    },
    // API keys / bearer tokens
    {
      name: "api-key",
      regex:
        /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|bearer|authorization|token)\s*[:=]\s*)("?)([A-Za-z0-9._\-]{12,})(\2)/gi,
      replacer: (_m, pre, q) => `${pre}${q}${MASK}${q}`,
    },
    // Standalone long secret-looking tokens (sk-..., ghp_..., long base64)
    {
      name: "token-literal",
      regex: /\b(?:sk|pk|ghp|gho|xoxb|xoxp)[_-][A-Za-z0-9]{16,}\b/g,
      replacer: () => MASK,
    },
    // Email addresses
    {
      name: "email",
      regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
      replacer: () => "[REDACTED-EMAIL]",
    },
    // PAN-OS serial numbers (12-16 digit device serials, and serial: fields)
    {
      name: "serial-field",
      regex: /((?:serial(?:[\s_-]?number)?|serial)\s*[:=]\s*)("?)([A-Z0-9]{9,20})(\2)/gi,
      replacer: (_m, pre, q) => `${pre}${q}[REDACTED-SERIAL]${q}`,
    },
    // Public IPv4 addresses (non RFC1918 / non loopback / non link-local)
    {
      name: "public-ipv4",
      regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
      replacer: (m) => (isPrivateIp(m) ? m : "[REDACTED-PUBLIC-IP]"),
    },
  ];

  if (opts.redactPrivateIps) {
    rules.push({
      name: "private-ipv4",
      regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
      replacer: (m) => (isPrivateIp(m) ? "[REDACTED-PRIVATE-IP]" : m),
    });
  }

  if (opts.redactInternalFqdns) {
    rules.push({
      name: "internal-fqdn",
      regex:
        /\b(?:[a-z0-9-]+\.)+(?:local|internal|corp|lan|intranet|home|priv)\b/gi,
      replacer: () => "[REDACTED-FQDN]",
    });
  }

  return rules;
}

export function isPrivateIp(ip: string): boolean {
  const parts = ip.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return true; // malformed -> treat as private (don't leak)
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 0) return true;
  if (a >= 224) return true; // multicast / reserved
  return false;
}

/** Redact a block of text according to the supplied options. */
export function redactText(input: string, opts: RedactionOptions = {}): string {
  if (!input) return input;
  let out = input;
  for (const rule of buildRules(opts)) {
    out = out.replace(rule.regex, (rule.replacer as never) ?? MASK);
  }
  return out;
}

/** Convenience for redacting a single short value (e.g. a serial in the UI). */
export function redactSerial(serial: string | null | undefined): string {
  if (!serial) return "—";
  if (serial.length <= 4) return "[REDACTED]";
  return `••••••••${serial.slice(-4)}`;
}
