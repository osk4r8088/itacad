import type { Topic } from '../../schema';

export const authnAuthz: Topic = {
  id: 'authn-authz',
  category: 'security',
  title: 'Authentication and authorization',
  level: 1,
  definition: 'Authentication establishes who someone is; authorization decides what that someone is allowed to do. Every access to a protected system passes both checks, in that order.',
  why: 'The two words are mixed up constantly, and so are the failures. A stolen password is an authentication problem; a normal user who can open the salary list is an authorization problem. Most break-ins start with the first, and most of the damage they do is decided by the second.',
  sections: [
    {
      heading: 'Two questions',
      blocks: [
        {
          kind: 'table',
          caption: 'Authentication and authorization',
          columns: ['', 'Authentication', 'Authorization'],
          rows: [
            ['Question', 'Who are you, and can you prove it?', 'Are you allowed to do this?'],
            ['Works with', 'Passwords, keys, devices, biometrics', 'Rights, roles, rules'],
            ['Happens', 'At login, and again for sensitive actions', 'At every single access'],
            ['HTTP answer on failure', '401, not authenticated', '403, authenticated and not permitted'],
            ['Short forms', 'AuthN', 'AuthZ'],
          ],
        },
        {
          kind: 'text',
          text: 'Before both comes identification, the claim itself: a user name says who someone claims to be and proves nothing. After both comes accounting: recording who did what, so that it can be traced later.',
        },
      ],
    },
    {
      heading: 'Proving identity: factors',
      blocks: [
        {
          kind: 'table',
          caption: 'The three kinds of authentication factor',
          columns: ['Factor', 'Examples', 'Weakness'],
          rows: [
            ['Something you know', 'Password, PIN', 'Can be guessed, reused, phished or leaked from a server'],
            ['Something you have', 'Security key, phone with an authenticator app, smart card', 'Can be lost or stolen'],
            ['Something you are', 'Fingerprint, face', 'Cannot be changed after a leak; usually only unlocks a device that holds a key'],
          ],
        },
        {
          kind: 'text',
          text: 'Multi-factor authentication (MFA) asks for factors of at least two different kinds, so that one stolen secret is not enough. Two passwords are not two factors.',
        },
        {
          kind: 'text',
          text: 'Not all second factors are equal. A code typed from an SMS or an app can be typed into a fake site just as well as the password, and the attacker passes it on at once. Phishing-resistant methods, security keys and passkeys, use a key pair bound to the real site\'s address: the device signs a challenge only for the genuine site, there is no secret to type, and the server stores only a public key that is worthless to a thief.',
        },
      ],
    },
    {
      heading: 'Passwords, as they are recommended today',
      blocks: [
        {
          kind: 'list',
          items: [
            'Length beats complexity. The current NIST guideline requires at least 15 characters where the password is the only factor, and at least 8 where it is part of multi-factor authentication.',
            'No composition rules such as "one digit, one symbol"; they produce predictable patterns.',
            'No forced change on a schedule. A change is required when there is evidence of compromise.',
            'New passwords are checked against lists of common and leaked ones.',
            'One password per service, kept in a password manager. Reuse is what turns one leak into many break-ins.',
            'Servers store passwords only as salted hashes made with a slow, purpose-built function.',
          ],
        },
      ],
    },
    {
      heading: 'Deciding what is allowed',
      blocks: [
        {
          kind: 'text',
          text: 'Once the identity is known, every action is checked against rules. The common models differ in how the rules are written down.',
        },
        {
          kind: 'table',
          caption: 'Ways to express authorization',
          columns: ['Model', 'Rule looks like', 'Typical use'],
          rows: [
            ['Access control list', 'This file: Alice may read and write, the group sales may read', 'File systems, network devices'],
            ['Role-based (RBAC)', 'The role "accountant" may post invoices; Alice has that role', 'Business applications, cloud platforms'],
            ['Attribute-based (ABAC)', 'Doctors may read records of patients of their own ward during their shift', 'Fine-grained rules across large organizations'],
          ],
        },
        {
          kind: 'text',
          text: 'After login, a system does not ask for the password at every click. It issues a session or an access token, a temporary proof of the successful login that accompanies each request. Whoever holds it is treated as the user, so it must travel encrypted, expire, and be revocable. Single sign-on extends the idea: one identity provider authenticates the user and vouches for them to many applications, using protocols such as OpenID Connect, SAML or Kerberos. OAuth 2.0, often mentioned in the same breath, is about delegated authorization: letting an application act on a user\'s behalf with limited rights.',
        },
      ],
    },
  ],
  misconceptions: [
    { myth: 'Whoever is logged in is allowed.', truth: 'Login only settles identity. Each action still has to be checked against that identity\'s rights; skipping this is one of the most common flaws in web applications.' },
    { myth: 'A password with symbols and digits is a strong password.', truth: 'Strength comes from length and unpredictability. "Summer2026!" satisfies every composition rule and is among the first guesses.' },
    { myth: 'With multi-factor authentication, phishing no longer works.', truth: 'Codes from SMS or apps can be relayed by a fake site in real time. Only methods bound to the site\'s address, security keys and passkeys, resist that.' },
  ],
  practice: {
    commands: [
      { os: 'Linux', command: 'id', shows: 'The identity of the current session: user, primary group and all groups. Authorization decisions use exactly this.' },
      { os: 'Linux', command: 'sudo -l', shows: 'What this user is authorized to run with elevated rights.' },
      { os: 'Linux', command: 'ssh -v user@host 2>&1 | grep -i "authentications that can continue"', shows: 'The authentication methods an SSH server offers, such as publickey or password.' },
      { os: 'Linux', command: 'curl -s -o /dev/null -w "%{http_code}\\n" https://api.github.com/user', shows: 'A request without credentials to a protected resource returns 401: not authenticated.' },
      { os: 'Linux', command: 'klist', shows: 'In a Kerberos environment: the tickets the current session holds, each a time-limited proof of authentication.' },
      { os: 'Windows', command: 'whoami /groups', shows: 'The groups of the current user, which decide most access rights.' },
      { os: 'Windows', command: 'whoami /priv', shows: 'The privileges the current session holds.' },
      { os: 'macOS', command: 'id; dscl . -read /Groups/admin GroupMembership', shows: 'The current identity, and who belongs to the administrators group.' },
    ],
    numbers: [
      { label: 'Minimum password length, password as only factor', value: '15 characters', note: 'NIST SP 800-63B, revision 4' },
      { label: 'Minimum password length, as part of MFA', value: '8 characters', note: 'NIST SP 800-63B, revision 4' },
    ],
    examples: [
      'A web shop shows an order at /orders/1041. Changing the number to 1042 shows another customer\'s order: authentication worked, and authorization was never checked.',
      'An employee enters password and app code on a fake login page. The attackers relay both within seconds and are in. With a security key, the fake address would have received no valid answer.',
    ],
  },
  terms: [
    { term: 'Authentication', definition: 'Verifying that someone or something is who it claims to be.' },
    { term: 'Authorization', definition: 'Deciding whether an authenticated identity may perform a given action.' },
    { term: 'Authentication factor', definition: 'A kind of evidence for an identity: something you know, something you have, or something you are.' },
    { term: 'Multi-factor authentication (MFA)', definition: 'Authentication that requires factors of at least two different kinds.' },
    { term: 'Passkey', definition: 'A key pair used for login in place of a password, bound to one site and resistant to phishing.' },
    { term: 'Phishing', definition: 'Tricking someone into giving credentials or approval to a fake site or sender.' },
    { term: 'Credential stuffing', definition: 'Trying user names and passwords leaked from one service on other services.' },
    { term: 'Role-based access control (RBAC)', definition: 'Granting rights to roles and assigning roles to users.' },
    { term: 'Session', definition: 'The state that links a series of requests to one successful login.' },
    { term: 'Access token', definition: 'A temporary credential issued after authentication and presented with each request.' },
    { term: 'Single sign-on (SSO)', definition: 'Logging in once at an identity provider and gaining access to many applications.' },
  ],
  related: [{ entry: 'passwords' }, { topic: 'least-privilege' }, { topic: 'hashing-encryption' }, { topic: 'permissions' }, { topic: 'certificates-pki' }, { protocol: 'ssh' }, { protocol: 'http1' }],
  sources: [
    { spec: 'NIST Special Publication 800-63B, revision 4: Digital Identity Guidelines, Authentication and Authenticator Management', url: 'https://pages.nist.gov/800-63-4/sp800-63b/authenticators', note: 'factors, password length, no composition rules, no periodic change' },
    { rfc: 9110, section: '15.5', note: 'HTTP status codes 401 Unauthorized and 403 Forbidden' },
    { rfc: 6749, note: 'OAuth 2.0 authorization framework' },
    { spec: 'W3C: Web Authentication (WebAuthn)', url: 'https://www.w3.org/TR/webauthn-3/', note: 'public key credentials bound to an origin; not checked for this page' },
    { spec: 'OWASP Top 10: Broken Access Control', url: 'https://owasp.org/Top10/', note: 'missing authorization checks as a leading web risk; not checked for this page' },
    { spec: 'Ferraiolo, Kuhn: Role-Based Access Controls, 1992', note: 'origin of RBAC' },
  ],
  quiz: [
    {
      id: 'which',
      prompt: 'A logged-in user tries to open the administration page and gets "403 Forbidden". Which check failed?',
      options: ['Authentication', 'Authorization', 'Encryption', 'Accounting'],
      answer: 1,
      explanation: 'The system knows who the user is and decided that this user may not do that.',
    },
    {
      id: 'mfa',
      prompt: 'Which combination is multi-factor authentication?',
      options: ['A password and a PIN', 'A password and a security key', 'Two different passwords', 'A user name and a password'],
      answer: 1,
      explanation: 'Knowledge plus possession are two different kinds of factor. A password and a PIN are both knowledge.',
    },
    {
      id: 'policy',
      prompt: 'Which password rule does the current NIST guideline recommend?',
      options: ['Change every 90 days', 'At least one symbol and one digit', 'Long passwords, checked against lists of leaked ones, changed only on evidence of compromise', 'Exactly eight characters'],
      answer: 2,
      explanation: 'Length and screening against known bad passwords replaced composition rules and scheduled changes.',
    },
    {
      id: 'phish',
      prompt: 'Why does a passkey or security key resist phishing when a code from an app does not?',
      options: ['The key is longer', 'The device answers only for the genuine site address, so a fake site gets nothing usable', 'Codes are sent unencrypted', 'Security keys need no server'],
      answer: 1,
      explanation: 'A typed code can be relayed. A key pair bound to the real origin produces no valid signature for another address.',
    },
  ],
};
