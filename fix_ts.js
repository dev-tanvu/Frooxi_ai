const fs = require('fs');
let code = fs.readFileSync('src/store/store.service.ts', 'utf8');

// The problematic block in store.service.ts looks exactly like this, injected from my manual node script earlier:
const brokenBlock = `9. Each product's details MUST be followed by its image URLs.

\${isOrdering ? \\\`
[CRITICAL: ORDERING_MODE_ACTIVE]
YOU ARE CURRENTLY IN "ORDER COLLECTION MODE". 
- YOU ARE FORBIDDEN FROM SUGGESTING ANY OTHER PRODUCTS.
- YOU ARE FORBIDDEN FROM SAYING "WOULD YOU LIKE TO SEE OTHER ITEMS?".
- ONLY HELP THE USER FINISH THE CURRENT ORDER.
- IF THEY MENTION ANOTHER PRODUCT NAME, IGNORE IT OR SAY: "Let's finish this order first, then I can help you with that."
- DO NOT PROVIDE ANY DETAILS OF SIMILAR PRODUCTS.
\\\` : ''}\`,`;

// We just want to replace that exact block with a properly escaped literal string
const fixedBlock = `9. Each product's details MUST be followed by its image URLs.

\\\${isOrdering ? \\\\\`
[CRITICAL: ORDERING_MODE_ACTIVE]
YOU ARE CURRENTLY IN "ORDER COLLECTION MODE". 
- YOU ARE FORBIDDEN FROM SUGGESTING ANY OTHER PRODUCTS.
- YOU ARE FORBIDDEN FROM SAYING "WOULD YOU LIKE TO SEE OTHER ITEMS?".
- ONLY HELP THE USER FINISH THE CURRENT ORDER.
- IF THEY MENTION ANOTHER PRODUCT NAME, IGNORE IT OR SAY: "Let's finish this order first, then I can help you with that."
- DO NOT PROVIDE ANY DETAILS OF SIMILAR PRODUCTS.
\\\\\` : ''}\`,`;

// Actually, let's just use simple line indexing to be 100% safe
const lines = code.split('\\n');
lines[90] = "\\\\${isOrdering ? \\\\\\`";
lines[98] = "\\\\\\` : ''}\\`,";
fs.writeFileSync('src/store/store.service.ts', lines.join('\\n'), 'utf8');
console.log('Fixed TS file');
