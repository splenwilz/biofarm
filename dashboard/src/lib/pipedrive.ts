/**
 * Links into Pipedrive. The company subdomain comes from NEXT_PUBLIC_PIPEDRIVE_COMPANY_DOMAIN
 * (the same value the API holds as BIOFARM_PIPEDRIVE_COMPANY_DOMAIN); without it the links go
 * through app.pipedrive.com, which sends a signed-in user to their own company.
 */
export const PIPEDRIVE_COMPANY_DOMAIN = process.env.NEXT_PUBLIC_PIPEDRIVE_COMPANY_DOMAIN || "app";

/** The deal's page in Pipedrive. Ids are numeric there; a prefixed id such as the demo's "deal-57" is reduced to its number. */
export function pipedriveDealUrl(id: string, domain: string = PIPEDRIVE_COMPANY_DOMAIN): string {
  const number = id.replace(/\D/g, "") || id;
  return `https://${domain}.pipedrive.com/deal/${number}`;
}
