"use strict";

function normalizeName(value) {
  if (!value) return "";
  return String(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function rowJoinedName(contact) {
  return normalizeName(`${contact.firstName || ""} ${contact.lastName || ""}`);
}

function matchContact(linkedinName, contacts) {
  const normalizedLi = normalizeName(linkedinName);
  if (!normalizedLi) return null;
  if (!Array.isArray(contacts) || contacts.length === 0) return null;

  // Step 2: exact normalized match
  const exact = contacts.filter(
    (c) => rowJoinedName(c) === normalizedLi
  );
  if (exact.length === 1) return exact[0];

  // Step 3: token containment fallback
  const liTokens = new Set(normalizedLi.split(" ").filter(Boolean));
  const tokenMatches = contacts.filter((c) => {
    const first = normalizeName(c.firstName);
    const last  = normalizeName(c.lastName);
    if (!first || !last) return false;
    const firstTokens = first.split(" ").filter(Boolean);
    const lastTokens  = last.split(" ").filter(Boolean);
    const allFirstIn = firstTokens.every((t) => liTokens.has(t));
    const allLastIn  = lastTokens.every((t)  => liTokens.has(t));
    return allFirstIn && allLastIn;
  });
  if (tokenMatches.length === 1) return tokenMatches[0];

  return null;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { matchContact, normalizeName };
}
