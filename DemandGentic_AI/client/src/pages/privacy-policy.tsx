import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { BRAND, FOOTER } from "@shared/brand-messaging";

export default function PrivacyPolicyPage() {
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
      
        
          Privacy Policy
          Last updated: February 7, 2025

          
            
              1. Introduction
              
                Pivotal B2B LLC ("Company," "we," "us," or "our"), respects your privacy and is committed to protecting your personal data. This privacy policy explains how we collect, use, disclose, and safeguard your information when you visit our website or use our services.
              
              
                Company Information:
                Pivotal B2B LLC
                Lewes, Delaware, United States
                Phone: (417) 900-3844
                Website: {BRAND.domains.primary}
              
            

            
              2. Information We Collect
              2.1 Personal Data
              We may collect the following types of personal information:
              
                Contact information (name, email address, phone number, company name, job title)
                Account credentials (username, password)
                Billing information (payment details, billing address)
                Communication preferences
                Usage data and analytics
              

              2.2 B2B Contact Data
              
                As a B2B demand generation platform, we maintain a database of business contact information sourced from publicly available sources, data partners, and user-provided data. This data is used exclusively for legitimate B2B marketing purposes.
              

              2.3 Automatically Collected Data
              
                IP address and device information
                Browser type and version
                Pages visited and time spent
                Referring website addresses
                Cookies and similar tracking technologies
              
            

            
              3. How We Use Your Information
              We use collected information for the following purposes:
              
                To provide and maintain our services
                To process transactions and send related information
                To send promotional communications (with your consent)
                To respond to inquiries and provide customer support
                To improve our website and services
                To comply with legal obligations
                To detect and prevent fraud or security issues
              
            

            
              4. Legal Basis for Processing (GDPR)
              Under the GDPR, we process personal data based on the following legal grounds:
              
                Consent: Where you have given explicit consent for specific purposes
                Contract: Where processing is necessary to perform a contract with you
                Legitimate Interest: Where processing is necessary for our legitimate business interests, provided these do not override your rights
                Legal Obligation: Where processing is required to comply with applicable laws
              
            

            
              5. Data Sharing and Disclosure
              We may share your information with:
              
                Service Providers: Third-party vendors who assist in operating our platform
                Business Partners: With your consent, for co-marketing purposes
                Legal Requirements: When required by law or to protect our rights
                Business Transfers: In connection with mergers, acquisitions, or asset sales
              
              
                We do not sell your personal information to third parties.
              
            

            
              6. Data Security
              
                We implement appropriate technical and organizational security measures to protect your personal data, including:
              
              
                Encryption of data in transit and at rest
                Regular security assessments and audits
                Access controls and authentication measures
                Employee training on data protection
              
            

            
              7. Data Retention
              
                We retain personal data only for as long as necessary to fulfill the purposes for which it was collected, or as required by law. When data is no longer needed, it is securely deleted or anonymized.
              
            

            
              8. Your Rights
              Depending on your location, you may have the following rights:
              
                Access: Request a copy of your personal data
                Rectification: Request correction of inaccurate data
                Erasure: Request deletion of your data ("right to be forgotten")
                Restriction: Request limitation of processing
                Portability: Request transfer of your data to another service
                Objection: Object to processing based on legitimate interests
                Withdraw Consent: Withdraw previously given consent
              
              
                To exercise these rights, please contact us at privacy@{BRAND.domains.primary}.
              
            

            
              9. Cookies
              
                We use cookies and similar tracking technologies to enhance your experience. You can manage cookie preferences through your browser settings. For more details, see our Cookie Policy section.
              
            

            
              10. International Data Transfers
              
                Your data may be transferred to and processed in countries outside your jurisdiction. We ensure appropriate safeguards are in place, including Standard Contractual Clauses where required.
              
            

            
              11. Children's Privacy
              
                Our services are not directed to individuals under 18 years of age. We do not knowingly collect personal information from children.
              
            

            
              12. Changes to This Policy
              
                We may update this privacy policy from time to time. We will notify you of any material changes by posting the new policy on this page and updating the "Last updated" date.
              
            

            
              13. Contact Us
              
                If you have questions about this privacy policy or our data practices, please contact us:
              
              
                Pivotal B2B LLC
                Lewes, Delaware, United States
                Phone: (417) 900-3844
                Email: privacy@{BRAND.domains.primary}
                Website: {BRAND.domains.primary}
              
            
          
        
      

      {/* Footer */}
      
        
          
            {FOOTER.copyright}
          
          
            Privacy Policy
            Terms of Service
            GDPR
          
        
      
    
  );
}