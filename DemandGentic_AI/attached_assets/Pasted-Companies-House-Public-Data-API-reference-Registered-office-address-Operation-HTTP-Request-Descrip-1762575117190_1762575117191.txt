Companies House Public Data API reference
Registered office address
Operation	HTTP Request	Description
get	
GET /company/{companyNumber}/registered-office-address
Registered Office Address
Company profile
Operation	HTTP Request	Description
get	
GET /company/{companyNumber}
Company profile
Search
Operation	HTTP Request	Description
advanced company search	
GET /advanced-search/companies
Advanced search for a company
search all	
GET /search
Search All
search companies	
GET /search/companies
Search companies
search officers	
GET /search/officers
Search company officers
search disqualified officers	
GET /search/disqualified-officers
Search disqualified officers
search companies alphabetically	
GET /alphabetical-search/companies
Search for a company
search dissolved companies	
GET /dissolved-search/companies
Search for a dissolved company
Officers
Operation	HTTP Request	Description
list	
GET /company/{company_number}/officers
Company Officers
get	
GET /company/{company_number}/appointments/{appointment_id}
Get a company officer appointment
Registers
Operation	HTTP Request	Description
get	
GET /company/{company_number}/registers
Company registers
Charges
Operation	HTTP Request	Description
get	
GET /company/{company_number}/charges/{charge_id}
list	
GET /company/{company_number}/charges
Charges
Filing history
Operation	HTTP Request	Description
get	
GET /company/{company_number}/filing-history/{transaction_id}
filingHistoryItem resource
list	
GET /company/{company_number}/filing-history
filingHistoryList resource
Insolvency
Operation	HTTP Request	Description
get	
GET /company/{company_number}/insolvency
Exemptions
Operation	HTTP Request	Description
get	
GET /company/{company_number}/exemptions
Officer disqualifications
Operation	HTTP Request	Description
get corporate officer	
GET /disqualified-officers/corporate/{officer_id}
Get a corporate officers disqualifications
get natural officer	
GET /disqualified-officers/natural/{officer_id}
Get natural officers disqualifications
Officer appointments
Operation	HTTP Request	Description
list	
GET /officers/{officer_id}/appointments
Officer Appointment List
UK Establishments
Operation	HTTP Request	Description
get	
GET /company/{company_number}/uk-establishments
Company UK Establishments
Persons with significant control
Operation	HTTP Request	Description
get corporate entity beneficial owner	
GET /company/{company_number}/persons-with-significant-control/corporate-entity-beneficial-owner/{psc_id}
Get the corporate entity beneficial owner
get corporate entities	
GET /company/{company_number}/persons-with-significant-control/corporate-entity/{psc_id}
Get the corporate entity with significant control
get individual beneficial owner	
GET /company/{company_number}/persons-with-significant-control/individual-beneficial-owner/{psc_id}
Get the individual beneficial owner
get individual	
GET /company/{company_number}/persons-with-significant-control/individual/{psc_id}
Get the individual person with significant control
get legal person beneficial owner	
GET /company/{company_number}/persons-with-significant-control/legal-person-beneficial-owner/{psc_id}
Get the legal person beneficial owner
get legal persons	
GET /company/{company_number}/persons-with-significant-control/legal-person/{psc_id}
Get the legal person with significant control
get statement	
GET /company/{company_number}/persons-with-significant-control-statements/{statement_id}
Get the person with significant control statement
get super secure beneficial owner	
GET /company/{company_number}/persons-with-significant-control/super-secure-beneficial-owner/{super_secure_id}
Get the super secure beneficial owner
get super secure person	
GET /company/{company_number}/persons-with-significant-control/super-secure/{super_secure_id}
Get the super secure person with significant control
list	
GET /company/{company_number}/persons-with-significant-control
List the company persons with significant control
list statements	
GET /company/{company_number}/persons-with-significant-control-statements