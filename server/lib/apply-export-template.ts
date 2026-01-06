import type { ExportTemplate } from "@shared/schema";

/**
 * Applies an export template's field mappings to CSV data
 * @param dataMap - Map of our field keys to their values
 * @param template - The export template with fieldMappings and optional columnOrder
 * @returns Object with headers array and row data array
 */
export function applyExportTemplate(
  dataMap: Record<string, any>,
  template: ExportTemplate
): { headers: string[], row: any[] } {
  const { fieldMappings, columnOrder } = template;
  
  // Determine column order: use template's order if provided, otherwise use mapping keys
  const orderedKeys = columnOrder && columnOrder.length > 0
    ? columnOrder
    : Object.keys(fieldMappings);
  
  const headers: string[] = [];
  const row: any[] = [];
  
  for (const ourFieldKey of orderedKeys) {
    // Skip if field not in mappings
    if (!(ourFieldKey in fieldMappings)) {
      continue;
    }
    
    const clientColumnName = fieldMappings[ourFieldKey];
    
    // Add the client's custom header name
    headers.push(clientColumnName);
    
    // Add the corresponding data value (or empty if not found)
    const value = dataMap[ourFieldKey] !== undefined ? dataMap[ourFieldKey] : '';
    row.push(value);
  }
  
  return { headers, row };
}

/**
 * Gets the default field mappings for smart export (no template)
 * Returns headers and a function to map contact data to row
 */
export function getDefaultSmartExportMapping() {
  const headers = [
    'ID',
    'Full Name',
    'First Name',
    'Last Name',
    'Title',
    'Email',
    'LinkedIn URL',
    'CAV ID',
    'CAV User ID',
    // Smart Selected Fields
    'Best Phone',
    'Best Phone Source',
    'Best Address Line 1',
    'Best Address Line 2',
    'Best Address Line 3',
    'Best City',
    'Best State',
    'Best Country',
    'Best Postal Code',
    'Best Address Source',
    // Account Info
    'Company Name',
    'Company Domain',
    'Company Industry',
    // Status Fields
    'Eligibility Status',
    'Verification Status',
    'Email Status',
    'Suppressed',
    'Created At',
  ];
  
  return { headers };
}

/**
 * Converts contact and smart data into a field map for template application
 */
export function contactToFieldMap(contact: any, smartData: any, escapeCSV: (val: any) => string): Record<string, any> {
  return {
    // Contact basic fields
    id: contact.id,
    full_name: escapeCSV(contact.full_name),
    first_name: escapeCSV(contact.first_name),
    last_name: escapeCSV(contact.last_name),
    title: escapeCSV(contact.title),
    email: contact.email || '',
    linkedin_url: contact.linkedin_url || '',
    cav_id: contact.cav_id || '',
    cav_user_id: contact.cav_user_id || '',
    
    // Smart selection fields
    best_phone: smartData.phone.phoneFormatted || '',
    best_phone_source: smartData.phone.source,
    best_address_line1: escapeCSV(smartData.address.address.line1),
    best_address_line2: escapeCSV(smartData.address.address.line2),
    best_address_line3: escapeCSV(smartData.address.address.line3),
    best_city: escapeCSV(smartData.address.address.city),
    best_state: escapeCSV(smartData.address.address.state),
    best_country: escapeCSV(smartData.address.address.country),
    best_postal: smartData.address.address.postal || '',
    best_address_source: smartData.address.source,
    
    // Company fields
    account_name: escapeCSV(contact.account_name),
    account_domain: contact.account_domain || '',
    account_website: contact.account_domain ? `https://${contact.account_domain}` : '',
    account_industry: escapeCSV(contact.account_industry),
    account_revenue: contact.account_revenue || '',
    account_employee_count: contact.account_employee_count || '',
    
    // Status fields
    eligibility_status: contact.eligibility_status || '',
    verification_status: contact.verification_status || '',
    email_status: contact.email_status || '',
    qa_status: contact.qa_status || '',
    suppressed: contact.suppressed ? 'Yes' : 'No',
    
    // Original contact fields (for reference)
    mobile: contact.mobile || '',
    phone: contact.phone || '',
    contact_address1: escapeCSV(contact.contact_address1),
    contact_city: escapeCSV(contact.contact_city),
    contact_state: escapeCSV(contact.contact_state),
    contact_country: escapeCSV(contact.contact_country),
    contact_postal: contact.contact_postal || '',
    
    // Timestamps
    created_at: contact.created_at || '',
    updated_at: contact.updated_at || '',
  };
}
