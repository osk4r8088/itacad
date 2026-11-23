import type { Topic } from '../../schema';

export const certificatesPki: Topic = {
  id: 'certificates-pki',
  category: 'security',
  title: 'Certificates and PKI',
  level: 2,
  definition: 'A certificate is a signed statement that a public key belongs to a certain name; a public key infrastructure (PKI) is the system of certificate authorities, rules and software that issues such statements and lets everyone check them.',
  why: 'Encryption to the wrong party is worthless: a connection is secure only if the key on the other end belongs to who you meant. Certificates answer that question for every HTTPS site, and increasingly for services, devices and people inside organizations. Expired or misissued certificates are also among the most common causes of outages, so anyone who operates systems meets them sooner or later.',
  sections: [
    {
      heading: 'The problem certificates solve',
      blocks: [
        {
          kind: 'text',
          text: 'Asymmetric cryptography lets a browser agree on keys with a server it has never met. It does not say whose server that is. An attacker in the path, for example after ARP spoofing or with a poisoned DNS answer, can present its own public key, and the encryption then protects the conversation with the attacker.',
        },
        {
          kind: 'text',
          text: 'A certificate binds a public key to a name, and the binding is signed by a third party that both sides trust. The server presents its certificate and proves, by signing part of the handshake, that it holds the matching private key. The attacker can copy the certificate, which is public, and cannot produce that proof.',
        },
      ],
    },
    {
      heading: 'What is in a certificate',
      blocks: [
        {
          kind: 'table',
          caption: 'The main fields of an X.509 certificate',
          columns: ['Field', 'Content', 'Example'],
          rows: [
            ['Subject', 'Who the certificate is for', 'CN = www.example.com'],
            ['Subject alternative names', 'The names it is valid for; this is what browsers check', 'www.example.com, example.com'],
            ['Public key', 'The key being certified', 'An elliptic-curve or RSA key'],
            ['Issuer', 'Who signed it', 'The name of a certificate authority'],
            ['Validity', 'Not before, not after', 'A few months for public websites'],
            ['Extensions', 'What the key may be used for, whether it may sign other certificates, where to check revocation', 'Key usage, basic constraints'],
            ['Signature', 'The issuer\'s signature over all of the above', 'ECDSA or RSA with SHA-256'],
          ],
        },
        {
          kind: 'text',
          text: 'The certificate contains no secret and is sent to everyone. The private key never appears in it and stays on the server.',
        },
      ],
    },
    {
      heading: 'The chain of trust',
      blocks: [
        {
          kind: 'text',
          text: 'A certificate authority (CA) checks that an applicant controls a name and then signs a certificate for it. Whom to trust as a CA is settled in advance: operating systems and browsers ship a trust store with roughly a hundred or more root certificates of approved authorities.',
        },
        {
          kind: 'list',
          items: [
            'Root certificate: signed by itself, kept offline, present in the trust stores.',
            'Intermediate certificate: signed by the root, used for the daily issuing, so that the root key can stay locked away.',
            'Leaf certificate: signed by an intermediate, installed on the server together with the intermediates.',
          ],
        },
        {
          kind: 'text',
          text: 'A client checks every link: each signature must verify with the key of the next certificate up, the chain must end at a root in its trust store, every certificate must be within its validity period and not revoked, and the name in the address must appear among the subject alternative names. If any check fails, the connection is refused with a warning.',
        },
        {
          kind: 'text',
          text: 'The model has a known weakness: any trusted CA can issue a certificate for any name. Certificate Transparency counters it by requiring public certificates to be entered into open, append-only logs, so that domain owners and researchers can see every certificate issued for a name.',
        },
      ],
    },
    {
      heading: 'Lifetimes, renewal and revocation',
      blocks: [
        {
          kind: 'text',
          text: 'Certificates expire on purpose. A short lifetime limits how long a stolen key is useful and forces names to be re-validated. The maximum for public website certificates has been lowered in steps and stands at 200 days since March 2026; it drops to 100 days in March 2027 and to 47 days in March 2029.',
        },
        {
          kind: 'text',
          text: 'At that pace, renewal by hand is not workable. The ACME protocol automates it: a client on the server proves control of the name to the CA, typically by publishing a challenge value on the website or in DNS, receives the certificate and installs it, and repeats this well before expiry. Certificates that are no longer trustworthy before they expire, for example after a key leak, are revoked; clients learn of it through revocation lists or status queries, which work less reliably than expiry does, another reason for short lifetimes.',
        },
        {
          kind: 'list',
          items: [
            'Inside an organization, a private CA can issue certificates for internal names; its root must then be installed on every client.',
            'A self-signed certificate has no chain at all. It encrypts, and tells the client nothing about who is on the other end unless that exact certificate was installed by hand.',
            'Certificates are used for more than websites: mail servers, VPNs, code signing, client and device authentication, and mutual TLS between services.',
          ],
        },
      ],
    },
  ],
  misconceptions: [
    { myth: 'The lock in the browser means the site is trustworthy.', truth: 'It means the connection is encrypted and the server controls that domain name. A fraudulent site gets a valid certificate for its own domain as easily as anyone else.' },
    { myth: 'A certificate contains the private key.', truth: 'It contains the public key and a signature. The private key is a separate file or lives in hardware, and must never be shared.' },
    { myth: 'A certificate warning can be clicked away; the connection is encrypted anyway.', truth: 'Encrypted, yes, but possibly to an attacker. The warning is the only sign that the other end may not be who it claims to be.' },
  ],
  practice: {
    commands: [
      { os: 'Linux', command: 'openssl s_client -connect example.com:443 -servername example.com </dev/null 2>/dev/null | openssl x509 -noout -subject -issuer -dates -ext subjectAltName', shows: 'The certificate a server presents: subject, issuer, validity period and the names it covers.' },
      { os: 'Linux', command: 'openssl s_client -connect example.com:443 -showcerts </dev/null | grep -E "s:|i:"', shows: 'The chain the server sends: subject and issuer of each certificate, leaf first.' },
      { os: 'Linux', command: 'openssl x509 -in cert.pem -noout -text', shows: 'Every field of a certificate file in readable form.' },
      { os: 'Linux', command: 'openssl req -x509 -newkey ed25519 -nodes -keyout key.pem -out cert.pem -days 30 -subj "/CN=test.example"', shows: 'Creates a self-signed certificate: subject and issuer are the same name.' },
      { os: 'Linux', command: 'curl -sv https://example.com/ -o /dev/null 2>&1 | grep -E "subject:|issuer:|expire|SSL certificate verify"', shows: 'How a client sees the certificate, including the result of the verification.' },
      { os: 'Linux', command: 'ls /etc/ssl/certs | wc -l', shows: 'The size of the system trust store: the root certificates this machine trusts.' },
      { os: 'Windows', command: 'Get-ChildItem Cert:\\LocalMachine\\Root | Measure-Object', shows: 'The number of trusted root certificates in the Windows store (PowerShell).' },
      { os: 'macOS', command: 'security find-certificate -a /System/Library/Keychains/SystemRootCertificates.keychain | grep -c "labl"', shows: 'The number of root certificates that ship with macOS.' },
    ],
    numbers: [
      { label: 'Maximum lifetime of a public website certificate', value: '200 days', note: 'since 15 March 2026; 100 days from 15 March 2027, 47 days from 15 March 2029 (CA/Browser Forum ballot SC-081v3)' },
      { label: 'Typical chain length', value: '3 certificates', note: 'leaf, one intermediate, root' },
    ],
    examples: [
      'A company\'s customer portal is unreachable one morning: the certificate expired at midnight because the renewal reminder went to a former employee. Automatic renewal with monitoring of the remaining days prevents this.',
      'A server sends only its leaf certificate without the intermediate. Browsers that have the intermediate cached work; a command line client fails with "unable to get local issuer certificate".',
    ],
  },
  terms: [
    { term: 'Certificate', definition: 'A signed data structure that binds a public key to a name, with a validity period and an issuer.' },
    { term: 'Certificate authority (CA)', definition: 'An organization or system that verifies names and signs certificates for them.' },
    { term: 'Public key infrastructure (PKI)', definition: 'The authorities, policies and software that issue, distribute, check and revoke certificates.' },
    { term: 'Root certificate', definition: 'A self-signed certificate of a certificate authority that clients trust directly through their trust store.' },
    { term: 'Intermediate certificate', definition: 'A CA certificate signed by a root or another intermediate, used to sign leaf certificates.' },
    { term: 'Chain of trust', definition: 'The sequence of certificates from a leaf through intermediates to a trusted root, each signed by the next.' },
    { term: 'Trust store', definition: 'The set of root certificates a system or browser accepts as trustworthy.' },
    { term: 'Subject alternative name (SAN)', definition: 'The certificate extension that lists the host names and addresses the certificate is valid for.' },
    { term: 'Revocation', definition: 'Declaring a certificate invalid before it expires, published through revocation lists (CRL) or status queries (OCSP).' },
    { term: 'Self-signed certificate', definition: 'A certificate signed with its own key instead of by a certificate authority.' },
    { term: 'ACME', definition: 'The protocol by which a client proves control of a name to a CA and obtains and renews certificates automatically.' },
    { term: 'Certificate Transparency', definition: 'Public, append-only logs of issued certificates that make misissuance detectable.' },
  ],
  related: [{ protocol: 'tls' }, { topic: 'symmetric-asymmetric' }, { topic: 'hashing-encryption' }, { entry: 'arp-spoofing' }, { entry: 'dns-poisoning' }, { protocol: 'dns' }, { topic: 'monitoring' }],
  sources: [
    { rfc: 5280, note: 'X.509 certificates and revocation lists: fields, extensions, path validation' },
    { rfc: 8446, section: '4.4', note: 'TLS 1.3 authentication: Certificate and CertificateVerify' },
    { rfc: 9110, section: '4.3.4', note: 'https certificate verification: a certificate not valid for the origin means the connection is not trusted' },
    { rfc: 9525, note: 'Service Identity in TLS: matching the service name against the certificate; obsoletes RFC 6125' },
    { rfc: 8555, note: 'ACME, automatic certificate management' },
    { rfc: 6960, note: 'OCSP, online certificate status' },
    { rfc: 9162, note: 'Certificate Transparency, version 2.0' },
    { spec: 'CA/Browser Forum: Baseline Requirements for the Issuance and Management of Publicly-Trusted TLS Server Certificates', url: 'https://cabforum.org/working-groups/server/baseline-requirements/', note: 'validity limits as changed by ballot SC-081v3, 2025' },
  ],
  quiz: [
    {
      id: 'binds',
      prompt: 'What does a certificate state?',
      options: ['That a website is safe to use', 'That a public key belongs to a certain name, signed by an issuer', 'The private key of a server', 'The password of a server'],
      answer: 1,
      explanation: 'It binds a key to a name. Whether the owner of the name is honest is not something a certificate can say.',
    },
    {
      id: 'chain',
      prompt: 'How does a browser decide to trust a server certificate it has never seen?',
      options: ['It asks the server whether it is genuine', 'It follows the signatures up to a root certificate in its trust store and checks name, dates and revocation', 'It trusts every certificate that is not expired', 'It compares the certificate with the one of another site'],
      answer: 1,
      explanation: 'Trust comes from the chain: each certificate is signed by the next, ending at a root the system already trusts.',
    },
    {
      id: 'self',
      prompt: 'What is missing with a self-signed certificate?',
      options: ['Encryption', 'A public key', 'A trusted third party that vouches for the name', 'A validity period'],
      answer: 2,
      explanation: 'The connection is encrypted, but nobody the client trusts has confirmed whose key it is.',
    },
    {
      id: 'short',
      prompt: 'Why are certificate lifetimes being made shorter?',
      options: ['To earn more fees', 'To limit how long a stolen key or outdated validation remains useful, since revocation works unreliably', 'Because keys wear out', 'Because browsers cannot store long dates'],
      answer: 1,
      explanation: 'A certificate that expires soon needs no revocation to become useless. The price is that renewal has to be automated.',
    },
  ],
};
