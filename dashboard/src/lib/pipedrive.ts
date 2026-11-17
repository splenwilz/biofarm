/**
 * Links into Pipedrive. The company subdomain comes from NEXT_PUBLIC_PIPEDRIVE_COMPANY_DOMAIN
 * (the same value the API holds as BIOFARM_PIPEDRIVE_COMPANY_DOMAIN); without it the links go
 * through app.pipedrive.com, which sends a signed-in user to their own company.
 */
export const PIPEDRIVE_COMPANY_DOMAIN = process.env.NEXT_PUBLIC_PIPEDRIVE_COMPANY_DOMAIN || "app";

const LEAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The record's page in Pipedrive. Deal ids are numeric there; a prefixed id such as the demo's
 * "deal-57" is reduced to its number. A lead Sales ticked before converting it is a qualified
 * record under its lead id, a uuid, which opens in the leads inbox instead.
 */
export function pipedriveDealUrl(id: string, domain: string = PIPEDRIVE_COMPANY_DOMAIN): string {
  if (LEAD_ID.test(id)) return `https://${domain}.pipedrive.com/leads/inbox/${id}`;
  const number = id.replace(/\D/g, "") || id;
  return `https://${domain}.pipedrive.com/deal/${number}`;
}
