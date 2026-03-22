import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { BRAND, FOOTER } from "@shared/brand-messaging";

export default function GDPRPolicyPage() {
  const [, setLocation] = useLocation();

  return (
    
      {/* Navigation */}
      
        
           setLocation("/welcome")}>
            
              
                PB
                
              
            
            
              Pivotal B2B
              DemandGentic---Human-Led Strategy. AI-Powered Execution.
            
          
          
             setLocation("/welcome")}>
              
              Back to Home
            
             setLocation("/book/admin/demo")} className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700">
              Schedule Demo
              
            
          
        
      

      {/* Content */}
      
        
          GDPR Compliance
          Last updated: February 7, 2025

          
            
              1. Our Commitment to GDPR
              
                {BRAND.company.legalName} ("Company," "we," "us," or "our"), operating as {BRAND.company.productName}, is committed to complying with the General Data Protection Regulation (GDPR) and protecting the personal data of individuals in the European Economic Area (EEA) and United Kingdom (UK).
              
              
                Data Controller Information:
                {BRAND.company.legalName}
                Lewes, Delaware, United States
                Phone: (417) 900-3844
                Email: privacy@demandgentic.ai
              
            

            
              2. Data We Process
              2.1 Categories of Personal Data
              
                Identity Data: Name, job title, company name
                Contact Data: Business email address, phone number, business address
                Technical Data: IP address, browser type, device information
                Usage Data: Information about how you use our website and services
                Marketing Data: Preferences for receiving marketing communications
              

              2.2 Special Categories of Data
              
                We do not intentionally collect or process special categories of personal data (such as racial or ethnic origin, political opinions, religious beliefs, health data, etc.).
              
            

            
              3. Legal Basis for Processing
              
                Under GDPR, we process personal data based on the following legal grounds:
              

              
                Consent (Article 6(1)(a))
                
                  Where you have given explicit consent for specific purposes, such as receiving marketing communications or participating in surveys.
                
              

              
                Contract Performance (Article 6(1)(b))
                
                  Where processing is necessary to perform a contract with you or take steps at your request before entering into a contract.
                
              

              
                Legitimate Interest (Article 6(1)(f))
                
                  For B2B marketing purposes where we have a legitimate interest in promoting our services to business professionals, provided this does not override your fundamental rights and freedoms.
                
              

              
                Legal Obligation (Article 6(1)(c))
                
                  Where processing is required to comply with applicable laws and regulations.
                
              
            

            
              4. Your GDPR Rights
              
                Under GDPR, you have the following rights regarding your personal data:
              

              
                
                  Right of Access (Article 15)
                  You can request a copy of your personal data and information about how it is processed.
                

                
                  Right to Rectification (Article 16)
                  You can request correction of inaccurate or incomplete personal data.
                

                
                  Right to Erasure (Article 17)
                  You can request deletion of your personal data in certain circumstances ("right to be forgotten").
                

                
                  Right to Restriction (Article 18)
                  You can request limitation of processing in certain circumstances.
                

                
                  Right to Data Portability (Article 20)
                  You can request your data in a structured, machine-readable format for transfer to another service.
                

                
                  Right to Object (Article 21)
                  You can object to processing based on legitimate interests, including direct marketing.
                

                
                  Right to Withdraw Consent (Article 7)
                  You can withdraw consent at any time where processing is based on consent.
                

                
                  Right to Lodge a Complaint (Article 77)
                  You can lodge a complaint with a supervisory authority in your country of residence.
                
              
            

            
              5. How to Exercise Your Rights
              
                To exercise any of your GDPR rights, please contact us using one of the following methods:
              
              
                
                  Email: privacy@demandgentic.ai
                  Phone: (417) 900-3844
                  Subject Line: "GDPR Rights Request"
                
              
              
                We will respond to your request within 30 days. In complex cases, we may extend this period by an additional 60 days, in which case we will notify you.
              
              
                We may need to verify your identity before processing your request. This is to ensure we are sharing personal data with the correct individual.
              
            

            
              6. International Data Transfers
              
                As a US-based company, your personal data may be transferred to and processed in the United States. We ensure appropriate safeguards are in place for such transfers:
              
              
                Standard Contractual Clauses (SCCs): We use EU-approved SCCs for data transfers to non-adequate countries
                Data Processing Agreements: We have appropriate agreements with all data processors
                Security Measures: We implement technical and organizational measures to protect data
              
            

            
              7. Data Retention
              
                We retain personal data only for as long as necessary:
              
              
                Customer data: Duration of the business relationship plus 7 years for legal/tax purposes
                Marketing data: Until consent is withdrawn or you object to processing
                Website analytics: 26 months
                Suppression lists: Indefinitely to honor opt-out requests
              
            

            
              8. Data Security
              
                We implement appropriate technical and organizational measures to ensure a level of security appropriate to the risk, including:
              
              
                Encryption of personal data in transit and at rest
                Regular security testing and assessments
                Access controls and authentication measures
                Employee training on data protection
                Incident response and breach notification procedures
              
            

            
              9. Data Breach Notification
              
                In the event of a personal data breach that is likely to result in a risk to your rights and freedoms, we will:
              
              
                Notify the relevant supervisory authority within 72 hours
                Notify affected individuals without undue delay if there is a high risk
                Document all breaches and remedial actions taken
              
            

            
              10. Cookies and Tracking
              
                We use cookies and similar technologies on our website. For EEA/UK visitors, we obtain consent before placing non-essential cookies. You can manage your cookie preferences through our cookie banner or browser settings.
              
            

            
              11. Sub-Processors
              
                We engage third-party sub-processors to help deliver our services. All sub-processors are bound by data processing agreements that ensure GDPR-compliant processing. A list of our sub-processors is available upon request.
              
            

            
              12. Data Protection Officer
              
                For any data protection inquiries, please contact:
              
              
                Data Protection Contact
                {BRAND.company.legalName}
                Email: privacy@demandgentic.ai
                Phone: (417) 900-3844
              
            

            
              13. Supervisory Authority
              
                You have the right to lodge a complaint with a supervisory authority. If you are in the EEA, you can contact the supervisory authority in your country of residence. A list of EEA supervisory authorities is available at:
              
              
                
                  European Data Protection Board - Members
                
              
            

            
              14. Updates to This Policy
              
                We may update this GDPR compliance statement from time to time. We will notify you of any material changes by posting the updated policy on our website.
              
            
          
        
      

      {/* Footer */}
      
        
          
            {FOOTER.copyright}
          
          
            Privacy Policy
            Terms of Service
            GDPR
          
        
      
    
  );
}