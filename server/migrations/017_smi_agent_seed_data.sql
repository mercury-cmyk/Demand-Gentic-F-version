-- SMI Agent Seed Data
-- Initial data for job role taxonomy, industry taxonomy, and business perspectives

-- ============================================================================
-- JOB ROLE TAXONOMY (50+ Common B2B Roles)
-- ============================================================================

-- Executive / C-Suite
INSERT INTO job_role_taxonomy (role_name, role_category, job_function, seniority_level, decision_authority, synonyms) VALUES
('Chief Executive Officer', 'Executive', 'Executive Leadership', 'c_level', 'decision_maker', ARRAY['CEO', 'Chief Exec', 'President & CEO']),
('Chief Technology Officer', 'Executive', 'Technology', 'c_level', 'decision_maker', ARRAY['CTO', 'Chief Tech Officer']),
('Chief Information Officer', 'Executive', 'Technology', 'c_level', 'decision_maker', ARRAY['CIO', 'Chief Info Officer']),
('Chief Financial Officer', 'Executive', 'Finance', 'c_level', 'decision_maker', ARRAY['CFO', 'Chief Finance Officer']),
('Chief Marketing Officer', 'Executive', 'Marketing', 'c_level', 'decision_maker', ARRAY['CMO', 'Chief Marketing']),
('Chief Operating Officer', 'Executive', 'Operations', 'c_level', 'decision_maker', ARRAY['COO', 'Chief Operations']),
('Chief Revenue Officer', 'Executive', 'Sales', 'c_level', 'decision_maker', ARRAY['CRO', 'Chief Revenue']),
('Chief People Officer', 'Executive', 'Human Resources', 'c_level', 'decision_maker', ARRAY['CPO', 'CHRO', 'Chief HR Officer']),
('Chief Security Officer', 'Executive', 'Security', 'c_level', 'decision_maker', ARRAY['CSO', 'CISO', 'Chief Info Security Officer']),
('Chief Data Officer', 'Executive', 'Technology', 'c_level', 'decision_maker', ARRAY['CDO', 'Chief Data']),

-- VP Level - Technology
('VP of Engineering', 'Technology', 'Engineering', 'vp', 'decision_maker', ARRAY['Vice President Engineering', 'VP Engineering', 'VP of Eng']),
('VP of Technology', 'Technology', 'Technology', 'vp', 'decision_maker', ARRAY['Vice President Technology', 'VP Tech']),
('VP of IT', 'Technology', 'Information Technology', 'vp', 'decision_maker', ARRAY['Vice President IT', 'VP Information Technology']),
('VP of Product', 'Technology', 'Product', 'vp', 'decision_maker', ARRAY['Vice President Product', 'VP Product Management']),
('VP of Data', 'Technology', 'Data', 'vp', 'decision_maker', ARRAY['Vice President Data', 'VP of Analytics']),

-- VP Level - Business
('VP of Sales', 'Sales', 'Sales', 'vp', 'decision_maker', ARRAY['Vice President Sales', 'VP of Revenue']),
('VP of Marketing', 'Marketing', 'Marketing', 'vp', 'decision_maker', ARRAY['Vice President Marketing']),
('VP of Operations', 'Operations', 'Operations', 'vp', 'decision_maker', ARRAY['Vice President Operations', 'VP Ops']),
('VP of Finance', 'Finance', 'Finance', 'vp', 'decision_maker', ARRAY['Vice President Finance']),
('VP of Human Resources', 'Human Resources', 'Human Resources', 'vp', 'decision_maker', ARRAY['Vice President HR', 'VP HR', 'VP People']),

-- Director Level - Technology
('Director of Engineering', 'Technology', 'Engineering', 'director', 'influencer', ARRAY['Engineering Director', 'Dir of Engineering']),
('Director of IT', 'Technology', 'Information Technology', 'director', 'influencer', ARRAY['IT Director', 'Dir of IT']),
('Director of Product', 'Technology', 'Product', 'director', 'influencer', ARRAY['Product Director', 'Dir of Product']),
('Director of DevOps', 'Technology', 'DevOps', 'director', 'influencer', ARRAY['DevOps Director', 'Dir of DevOps']),
('Director of Security', 'Technology', 'Security', 'director', 'influencer', ARRAY['Security Director', 'InfoSec Director']),
('Director of Data', 'Technology', 'Data', 'director', 'influencer', ARRAY['Data Director', 'Analytics Director']),

-- Director Level - Business
('Director of Sales', 'Sales', 'Sales', 'director', 'influencer', ARRAY['Sales Director', 'Dir of Sales']),
('Director of Marketing', 'Marketing', 'Marketing', 'director', 'influencer', ARRAY['Marketing Director', 'Dir of Marketing']),
('Director of Operations', 'Operations', 'Operations', 'director', 'influencer', ARRAY['Operations Director', 'Dir of Ops']),
('Director of Finance', 'Finance', 'Finance', 'director', 'influencer', ARRAY['Finance Director', 'Dir of Finance']),
('Director of HR', 'Human Resources', 'Human Resources', 'director', 'influencer', ARRAY['HR Director', 'Dir of HR']),
('Director of Procurement', 'Operations', 'Procurement', 'director', 'influencer', ARRAY['Procurement Director', 'Dir of Procurement']),

-- Manager Level - Technology
('Engineering Manager', 'Technology', 'Engineering', 'manager', 'influencer', ARRAY['Software Engineering Manager', 'Dev Manager']),
('IT Manager', 'Technology', 'Information Technology', 'manager', 'user', ARRAY['Information Technology Manager']),
('Product Manager', 'Technology', 'Product', 'manager', 'influencer', ARRAY['PM', 'Product Owner']),
('DevOps Manager', 'Technology', 'DevOps', 'manager', 'influencer', ARRAY['Platform Manager']),
('Security Manager', 'Technology', 'Security', 'manager', 'influencer', ARRAY['InfoSec Manager', 'Cybersecurity Manager']),
('Data Manager', 'Technology', 'Data', 'manager', 'influencer', ARRAY['Analytics Manager', 'BI Manager']),
('Project Manager', 'Technology', 'Project Management', 'manager', 'user', ARRAY['PM', 'Technical PM']),

-- Manager Level - Business
('Sales Manager', 'Sales', 'Sales', 'manager', 'influencer', ARRAY['Account Manager', 'Sales Team Lead']),
('Marketing Manager', 'Marketing', 'Marketing', 'manager', 'user', ARRAY['Digital Marketing Manager']),
('Operations Manager', 'Operations', 'Operations', 'manager', 'user', ARRAY['Ops Manager']),
('Finance Manager', 'Finance', 'Finance', 'manager', 'user', ARRAY['Financial Manager']),
('HR Manager', 'Human Resources', 'Human Resources', 'manager', 'user', ARRAY['Human Resources Manager', 'People Manager']),
('Procurement Manager', 'Operations', 'Procurement', 'manager', 'user', ARRAY['Purchasing Manager', 'Sourcing Manager']),

-- Individual Contributors - Technology
('Software Engineer', 'Technology', 'Engineering', 'individual_contributor', 'user', ARRAY['Developer', 'Programmer', 'SWE']),
('Senior Software Engineer', 'Technology', 'Engineering', 'senior', 'user', ARRAY['Senior Developer', 'Staff Engineer']),
('Data Engineer', 'Technology', 'Data', 'individual_contributor', 'user', ARRAY['Data Developer']),
('DevOps Engineer', 'Technology', 'DevOps', 'individual_contributor', 'user', ARRAY['SRE', 'Platform Engineer']),
('Security Analyst', 'Technology', 'Security', 'individual_contributor', 'user', ARRAY['InfoSec Analyst', 'Security Engineer']),
('System Administrator', 'Technology', 'Information Technology', 'individual_contributor', 'user', ARRAY['SysAdmin', 'IT Admin']),
('Network Engineer', 'Technology', 'Information Technology', 'individual_contributor', 'user', ARRAY['Network Admin', 'Network Analyst']),
('Business Analyst', 'Technology', 'Business Analysis', 'individual_contributor', 'user', ARRAY['BA', 'Systems Analyst']);

-- ============================================================================
-- ROLE ADJACENCY (Related Roles)
-- ============================================================================

-- CTO adjacencies
INSERT INTO role_adjacency (source_role_id, target_role_id, adjacency_type)
SELECT s.id, t.id, 'senior_to'
FROM job_role_taxonomy s, job_role_taxonomy t
WHERE s.role_name = 'Chief Technology Officer' AND t.role_name = 'VP of Engineering';

INSERT INTO role_adjacency (source_role_id, target_role_id, adjacency_type)
SELECT s.id, t.id, 'senior_to'
FROM job_role_taxonomy s, job_role_taxonomy t
WHERE s.role_name = 'Chief Technology Officer' AND t.role_name = 'VP of Technology';

INSERT INTO role_adjacency (source_role_id, target_role_id, adjacency_type)
SELECT s.id, t.id, 'collaborates_with'
FROM job_role_taxonomy s, job_role_taxonomy t
WHERE s.role_name = 'Chief Technology Officer' AND t.role_name = 'Chief Information Officer';

-- VP Engineering adjacencies
INSERT INTO role_adjacency (source_role_id, target_role_id, adjacency_type)
SELECT s.id, t.id, 'senior_to'
FROM job_role_taxonomy s, job_role_taxonomy t
WHERE s.role_name = 'VP of Engineering' AND t.role_name = 'Director of Engineering';

INSERT INTO role_adjacency (source_role_id, target_role_id, adjacency_type)
SELECT s.id, t.id, 'junior_to'
FROM job_role_taxonomy s, job_role_taxonomy t
WHERE s.role_name = 'VP of Engineering' AND t.role_name = 'Chief Technology Officer';

-- Director of Engineering adjacencies
INSERT INTO role_adjacency (source_role_id, target_role_id, adjacency_type)
SELECT s.id, t.id, 'senior_to'
FROM job_role_taxonomy s, job_role_taxonomy t
WHERE s.role_name = 'Director of Engineering' AND t.role_name = 'Engineering Manager';

-- CFO adjacencies
INSERT INTO role_adjacency (source_role_id, target_role_id, adjacency_type)
SELECT s.id, t.id, 'senior_to'
FROM job_role_taxonomy s, job_role_taxonomy t
WHERE s.role_name = 'Chief Financial Officer' AND t.role_name = 'VP of Finance';

-- CMO adjacencies
INSERT INTO role_adjacency (source_role_id, target_role_id, adjacency_type)
SELECT s.id, t.id, 'senior_to'
FROM job_role_taxonomy s, job_role_taxonomy t
WHERE s.role_name = 'Chief Marketing Officer' AND t.role_name = 'VP of Marketing';

-- ============================================================================
-- INDUSTRY TAXONOMY (Top 50 Industries)
-- ============================================================================

-- Level 1: Sectors
INSERT INTO industry_taxonomy (industry_name, industry_code, industry_level, sic_codes, naics_codes, typical_challenges, buying_behaviors) VALUES
('Technology', 'TECH', 1, ARRAY['7370', '7371', '7372', '7373'], ARRAY['511210', '518210', '541511', '541512'],
 ARRAY['Scaling infrastructure', 'Security compliance', 'Technical debt', 'Talent acquisition'],
 '{"decision_speed": "fast", "stakeholders": ["CTO", "VP Engineering"], "evaluation_factors": ["technical_fit", "integration", "scalability"]}'),

('Financial Services', 'FIN', 1, ARRAY['6020', '6022', '6211', '6311'], ARRAY['522110', '523110', '524113'],
 ARRAY['Regulatory compliance', 'Cybersecurity', 'Digital transformation', 'Customer experience'],
 '{"decision_speed": "slow", "stakeholders": ["CIO", "CFO", "Compliance"], "evaluation_factors": ["compliance", "security", "reliability"]}'),

('Healthcare', 'HEALTH', 1, ARRAY['8011', '8062', '8063'], ARRAY['621111', '622110', '621491'],
 ARRAY['HIPAA compliance', 'EHR integration', 'Data security', 'Operational efficiency'],
 '{"decision_speed": "medium", "stakeholders": ["CIO", "CMO", "Compliance"], "evaluation_factors": ["compliance", "interoperability", "patient_safety"]}'),

('Manufacturing', 'MFG', 1, ARRAY['3500', '3600', '3700'], ARRAY['332000', '333000', '334000'],
 ARRAY['Supply chain optimization', 'Quality control', 'Automation', 'Inventory management'],
 '{"decision_speed": "medium", "stakeholders": ["COO", "VP Operations", "Plant Manager"], "evaluation_factors": ["roi", "integration", "reliability"]}'),

('Retail', 'RETAIL', 1, ARRAY['5311', '5411', '5611'], ARRAY['445110', '452210', '454110'],
 ARRAY['Omnichannel experience', 'Inventory management', 'Customer personalization', 'Supply chain'],
 '{"decision_speed": "fast", "stakeholders": ["CIO", "CMO", "VP Operations"], "evaluation_factors": ["roi", "time_to_value", "scalability"]}'),

('Professional Services', 'PROSERV', 1, ARRAY['8111', '8721', '8742'], ARRAY['541110', '541611', '541990'],
 ARRAY['Utilization optimization', 'Talent management', 'Client delivery', 'Knowledge management'],
 '{"decision_speed": "medium", "stakeholders": ["Managing Partner", "CIO", "COO"], "evaluation_factors": ["roi", "ease_of_use", "integration"]}'),

('Education', 'EDU', 1, ARRAY['8211', '8221', '8222'], ARRAY['611110', '611310', '611210'],
 ARRAY['Student engagement', 'Budget constraints', 'Technology adoption', 'Data privacy'],
 '{"decision_speed": "slow", "stakeholders": ["CIO", "Dean", "IT Director"], "evaluation_factors": ["cost", "compliance", "user_adoption"]}'),

('Media & Entertainment', 'MEDIA', 1, ARRAY['7812', '7922', '7941'], ARRAY['512110', '515120', '711211'],
 ARRAY['Content delivery', 'Monetization', 'Audience engagement', 'Digital distribution'],
 '{"decision_speed": "fast", "stakeholders": ["CTO", "VP Content", "CMO"], "evaluation_factors": ["scalability", "innovation", "cost"]}'),

('Telecommunications', 'TELECOM', 1, ARRAY['4812', '4813', '4841'], ARRAY['517110', '517210', '517410'],
 ARRAY['Network modernization', '5G deployment', 'Customer churn', 'Operational efficiency'],
 '{"decision_speed": "medium", "stakeholders": ["CTO", "VP Network", "CIO"], "evaluation_factors": ["scalability", "reliability", "integration"]}'),

('Energy & Utilities', 'ENERGY', 1, ARRAY['4911', '4923', '4931'], ARRAY['221111', '221112', '221210'],
 ARRAY['Grid modernization', 'Sustainability', 'Asset management', 'Regulatory compliance'],
 '{"decision_speed": "slow", "stakeholders": ["CIO", "COO", "VP Operations"], "evaluation_factors": ["reliability", "compliance", "roi"]}');

-- Level 2: Sub-industries (Technology)
INSERT INTO industry_taxonomy (industry_name, industry_code, industry_level, parent_industry_id, sic_codes, naics_codes, typical_challenges) VALUES
('Software as a Service', 'SAAS', 2, (SELECT id FROM industry_taxonomy WHERE industry_code = 'TECH'),
 ARRAY['7372'], ARRAY['511210', '518210'], ARRAY['Customer retention', 'Scaling', 'Security']),
('Enterprise Software', 'ENTSOFT', 2, (SELECT id FROM industry_taxonomy WHERE industry_code = 'TECH'),
 ARRAY['7372'], ARRAY['511210'], ARRAY['Integration complexity', 'Long sales cycles', 'Customization']),
('Cybersecurity', 'CYBER', 2, (SELECT id FROM industry_taxonomy WHERE industry_code = 'TECH'),
 ARRAY['7382'], ARRAY['541512'], ARRAY['Threat landscape', 'Talent shortage', 'Compliance']),
('Cloud Infrastructure', 'CLOUD', 2, (SELECT id FROM industry_taxonomy WHERE industry_code = 'TECH'),
 ARRAY['7374'], ARRAY['518210'], ARRAY['Cost management', 'Multi-cloud', 'Security']);

-- Level 2: Sub-industries (Financial Services)
INSERT INTO industry_taxonomy (industry_name, industry_code, industry_level, parent_industry_id, sic_codes, naics_codes, typical_challenges) VALUES
('Banking', 'BANK', 2, (SELECT id FROM industry_taxonomy WHERE industry_code = 'FIN'),
 ARRAY['6020', '6022'], ARRAY['522110', '522120'], ARRAY['Digital banking', 'Fraud prevention', 'Compliance']),
('Insurance', 'INS', 2, (SELECT id FROM industry_taxonomy WHERE industry_code = 'FIN'),
 ARRAY['6311', '6321'], ARRAY['524113', '524114'], ARRAY['Claims processing', 'Underwriting', 'Customer experience']),
('Investment Management', 'INVEST', 2, (SELECT id FROM industry_taxonomy WHERE industry_code = 'FIN'),
 ARRAY['6211', '6282'], ARRAY['523110', '523920'], ARRAY['Market volatility', 'Regulatory reporting', 'Data management']);

-- ============================================================================
-- INDUSTRY-DEPARTMENT PAIN POINTS
-- ============================================================================

-- Technology Industry
INSERT INTO industry_department_pain_points (industry_id, department, pain_points, priorities, decision_factors) VALUES
((SELECT id FROM industry_taxonomy WHERE industry_code = 'TECH'), 'IT',
 ARRAY['Infrastructure scaling', 'Security compliance', 'Tool sprawl', 'Technical debt'],
 ARRAY['Reliability', 'Security', 'Developer productivity'],
 ARRAY['Integration capabilities', 'Scalability', 'Vendor support']),

((SELECT id FROM industry_taxonomy WHERE industry_code = 'TECH'), 'Engineering',
 ARRAY['Code quality', 'Deployment velocity', 'Testing coverage', 'Documentation'],
 ARRAY['Developer experience', 'Automation', 'Code review'],
 ARRAY['Ease of integration', 'Learning curve', 'Community support']),

((SELECT id FROM industry_taxonomy WHERE industry_code = 'TECH'), 'Operations',
 ARRAY['Incident management', 'Monitoring gaps', 'On-call burden', 'Manual processes'],
 ARRAY['Visibility', 'Automation', 'Reliability'],
 ARRAY['Integration depth', 'Alert quality', 'Automation capabilities']);

-- Financial Services Industry
INSERT INTO industry_department_pain_points (industry_id, department, pain_points, priorities, decision_factors) VALUES
((SELECT id FROM industry_taxonomy WHERE industry_code = 'FIN'), 'IT',
 ARRAY['Legacy system integration', 'Security requirements', 'Audit compliance', 'Change management'],
 ARRAY['Security', 'Compliance', 'Reliability'],
 ARRAY['Regulatory compliance', 'Vendor stability', 'Support SLAs']),

((SELECT id FROM industry_taxonomy WHERE industry_code = 'FIN'), 'Finance',
 ARRAY['Financial close process', 'Reporting accuracy', 'Audit preparation', 'Data reconciliation'],
 ARRAY['Accuracy', 'Timeliness', 'Audit readiness'],
 ARRAY['Data integrity', 'Audit trail', 'Integration with ERP']),

((SELECT id FROM industry_taxonomy WHERE industry_code = 'FIN'), 'Operations',
 ARRAY['Process efficiency', 'Risk management', 'Customer service', 'Fraud detection'],
 ARRAY['Risk reduction', 'Efficiency', 'Customer satisfaction'],
 ARRAY['Process automation', 'Risk scoring', 'Integration capabilities']);

-- Healthcare Industry
INSERT INTO industry_department_pain_points (industry_id, department, pain_points, priorities, decision_factors) VALUES
((SELECT id FROM industry_taxonomy WHERE industry_code = 'HEALTH'), 'IT',
 ARRAY['EHR integration', 'HIPAA compliance', 'System interoperability', 'Data migration'],
 ARRAY['Compliance', 'Interoperability', 'Security'],
 ARRAY['HIPAA certification', 'HL7/FHIR support', 'Vendor experience']),

((SELECT id FROM industry_taxonomy WHERE industry_code = 'HEALTH'), 'Operations',
 ARRAY['Patient flow', 'Resource scheduling', 'Supply chain', 'Staff utilization'],
 ARRAY['Patient care', 'Efficiency', 'Cost control'],
 ARRAY['Workflow integration', 'Analytics capabilities', 'User adoption']);

-- ============================================================================
-- BUSINESS PERSPECTIVES (5 Core Lenses)
-- ============================================================================

INSERT INTO business_perspectives (perspective_code, perspective_name, description, evaluation_criteria, key_metrics, common_concerns, value_drivers) VALUES
('FINANCE', 'Finance & CFO', 'Financial decision-making lens focused on ROI, cost control, and fiscal responsibility',
 ARRAY['Total cost of ownership', 'ROI timeline', 'Budget impact', 'Financial risk'],
 ARRAY['Cost savings %', 'ROI', 'Payback period', 'Budget variance'],
 ARRAY['Budget overruns', 'Hidden costs', 'Vendor lock-in', 'Implementation costs'],
 ARRAY['Cost reduction', 'Efficiency gains', 'Risk mitigation', 'Revenue enablement']),

('HR', 'Human Resources', 'People-focused lens emphasizing employee experience, productivity, and talent management',
 ARRAY['User adoption', 'Training requirements', 'Employee impact', 'Productivity gains'],
 ARRAY['Employee satisfaction', 'Adoption rate', 'Time to proficiency', 'Productivity metrics'],
 ARRAY['Change management', 'Training burden', 'Employee resistance', 'Workflow disruption'],
 ARRAY['Employee productivity', 'Talent retention', 'Skill development', 'Work-life balance']),

('MARKETING', 'Marketing & Growth', 'Customer acquisition and brand lens focused on growth, engagement, and market positioning',
 ARRAY['Customer acquisition impact', 'Brand alignment', 'Market differentiation', 'Campaign effectiveness'],
 ARRAY['CAC', 'Conversion rate', 'Brand awareness', 'Engagement metrics'],
 ARRAY['Brand consistency', 'Customer experience', 'Competitive positioning', 'Market timing'],
 ARRAY['Revenue growth', 'Customer loyalty', 'Market share', 'Brand equity']),

('OPERATIONS', 'Operations & Efficiency', 'Process-focused lens emphasizing efficiency, reliability, and operational excellence',
 ARRAY['Process efficiency', 'System reliability', 'Scalability', 'Operational risk'],
 ARRAY['Uptime %', 'Process cycle time', 'Error rate', 'Throughput'],
 ARRAY['System downtime', 'Integration complexity', 'Process disruption', 'Vendor dependency'],
 ARRAY['Process automation', 'Operational efficiency', 'Quality improvement', 'Scale enablement']),

('IT_SECURITY', 'IT & Security', 'Technology and security lens focused on technical fit, security, and compliance',
 ARRAY['Technical architecture fit', 'Security posture', 'Compliance requirements', 'Integration complexity'],
 ARRAY['Security score', 'Compliance status', 'Integration success rate', 'Technical debt impact'],
 ARRAY['Security vulnerabilities', 'Data privacy', 'Compliance gaps', 'Technical debt'],
 ARRAY['Security enhancement', 'Compliance achievement', 'Technical modernization', 'Risk reduction']);

-- ============================================================================
-- INITIAL JOB TITLE MAPPINGS (Common Variations)
-- ============================================================================

-- CEO variations
INSERT INTO job_title_mappings (raw_title, raw_title_normalized, mapped_role_id, confidence, mapping_source)
SELECT 'CEO', 'ceo', id, 0.99, 'system' FROM job_role_taxonomy WHERE role_name = 'Chief Executive Officer';

INSERT INTO job_title_mappings (raw_title, raw_title_normalized, mapped_role_id, confidence, mapping_source)
SELECT 'Chief Executive Officer', 'chief executive officer', id, 0.99, 'system' FROM job_role_taxonomy WHERE role_name = 'Chief Executive Officer';

-- CTO variations
INSERT INTO job_title_mappings (raw_title, raw_title_normalized, mapped_role_id, confidence, mapping_source)
SELECT 'CTO', 'cto', id, 0.99, 'system' FROM job_role_taxonomy WHERE role_name = 'Chief Technology Officer';

INSERT INTO job_title_mappings (raw_title, raw_title_normalized, mapped_role_id, confidence, mapping_source)
SELECT 'Chief Technology Officer', 'chief technology officer', id, 0.99, 'system' FROM job_role_taxonomy WHERE role_name = 'Chief Technology Officer';

-- CIO variations
INSERT INTO job_title_mappings (raw_title, raw_title_normalized, mapped_role_id, confidence, mapping_source)
SELECT 'CIO', 'cio', id, 0.99, 'system' FROM job_role_taxonomy WHERE role_name = 'Chief Information Officer';

INSERT INTO job_title_mappings (raw_title, raw_title_normalized, mapped_role_id, confidence, mapping_source)
SELECT 'Chief Information Officer', 'chief information officer', id, 0.99, 'system' FROM job_role_taxonomy WHERE role_name = 'Chief Information Officer';

-- CFO variations
INSERT INTO job_title_mappings (raw_title, raw_title_normalized, mapped_role_id, confidence, mapping_source)
SELECT 'CFO', 'cfo', id, 0.99, 'system' FROM job_role_taxonomy WHERE role_name = 'Chief Financial Officer';

INSERT INTO job_title_mappings (raw_title, raw_title_normalized, mapped_role_id, confidence, mapping_source)
SELECT 'Chief Financial Officer', 'chief financial officer', id, 0.99, 'system' FROM job_role_taxonomy WHERE role_name = 'Chief Financial Officer';

-- VP Engineering variations
INSERT INTO job_title_mappings (raw_title, raw_title_normalized, mapped_role_id, confidence, mapping_source)
SELECT 'VP of Engineering', 'vp of engineering', id, 0.99, 'system' FROM job_role_taxonomy WHERE role_name = 'VP of Engineering';

INSERT INTO job_title_mappings (raw_title, raw_title_normalized, mapped_role_id, confidence, mapping_source)
SELECT 'Vice President of Engineering', 'vice president of engineering', id, 0.99, 'system' FROM job_role_taxonomy WHERE role_name = 'VP of Engineering';

INSERT INTO job_title_mappings (raw_title, raw_title_normalized, mapped_role_id, confidence, mapping_source)
SELECT 'VP Engineering', 'vp engineering', id, 0.95, 'system' FROM job_role_taxonomy WHERE role_name = 'VP of Engineering';

-- Software Engineer variations
INSERT INTO job_title_mappings (raw_title, raw_title_normalized, mapped_role_id, confidence, mapping_source)
SELECT 'Software Engineer', 'software engineer', id, 0.99, 'system' FROM job_role_taxonomy WHERE role_name = 'Software Engineer';

INSERT INTO job_title_mappings (raw_title, raw_title_normalized, mapped_role_id, confidence, mapping_source)
SELECT 'Software Developer', 'software developer', id, 0.95, 'system' FROM job_role_taxonomy WHERE role_name = 'Software Engineer';

INSERT INTO job_title_mappings (raw_title, raw_title_normalized, mapped_role_id, confidence, mapping_source)
SELECT 'Developer', 'developer', id, 0.85, 'system' FROM job_role_taxonomy WHERE role_name = 'Software Engineer';

INSERT INTO job_title_mappings (raw_title, raw_title_normalized, mapped_role_id, confidence, mapping_source)
SELECT 'Programmer', 'programmer', id, 0.85, 'system' FROM job_role_taxonomy WHERE role_name = 'Software Engineer';

-- Update updated_at timestamps
UPDATE job_role_taxonomy SET updated_at = NOW();
UPDATE industry_taxonomy SET updated_at = NOW();
UPDATE job_title_mappings SET updated_at = NOW();
