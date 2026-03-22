import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { BRAND, FOOTER } from "@shared/brand-messaging";

export default function TermsOfServicePage() {
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
      
        
          Terms of Service
          Last updated: February 7, 2025

          
            
              1. Agreement to Terms
              
                These Terms of Service ("Terms") constitute a legally binding agreement between you and Pivotal B2B LLC ("Company," "we," "us," or "our"), operating as DemandGentic.ai, governing your access to and use of our website, platform, and services.
              
              
                By accessing or using our services, you agree to be bound by these Terms. If you do not agree to these Terms, you may not access or use our services.
              
              
                Company Information:
                Pivotal B2B LLC
                Lewes, Delaware, United States
                Phone: (417) 900-3844
                Website: {BRAND.domains.primary}
              
            

            
              2. Description of Services
              
                DemandGentic.ai provides B2B demand generation services including:
              
              
                AI-powered demand generation campaigns
                Account-based marketing (ABM) services
                B2B data and intelligence services
                AI SDR (Sales Development Representative) services
                Appointment generation services
                Content syndication and distribution
              
            

            
              3. Account Registration
              
                To access certain features, you may need to create an account. You agree to:
              
              
                Provide accurate, current, and complete information
                Maintain and update your information as needed
                Keep your password secure and confidential
                Accept responsibility for all activities under your account
                Notify us immediately of any unauthorized access
              
            

            
              4. Acceptable Use
              You agree NOT to use our services to:
              
                Violate any applicable laws or regulations
                Send unsolicited communications (spam) in violation of applicable laws
                Infringe on intellectual property rights of others
                Transmit malware, viruses, or harmful code
                Attempt to gain unauthorized access to our systems
                Interfere with or disrupt our services
                Engage in fraudulent or deceptive practices
                Collect data in violation of privacy laws
                Use our services for consumer marketing (B2C) purposes
              
            

            
              5. B2B Data Usage
              
                Our platform provides access to B2B contact data. By using this data, you agree to:
              
              
                Use data only for legitimate B2B marketing purposes
                Comply with all applicable data protection laws (GDPR, CAN-SPAM, CCPA, etc.)
                Honor opt-out and suppression requests
                Not resell or redistribute the data to third parties
                Implement appropriate data security measures
              
            

            
              6. Intellectual Property
              
                All content, features, and functionality of our services, including but not limited to text, graphics, logos, software, and AI models, are owned by Pivotal B2B LLC and are protected by intellectual property laws.
              
              
                You retain ownership of content you submit to our platform. By submitting content, you grant us a non-exclusive, worldwide, royalty-free license to use, reproduce, and display such content as necessary to provide our services.
              
            

            
              7. Payment Terms
              
                For paid services:
              
              
                Fees are specified in your service agreement or order form
                Payment is due according to the terms specified in your agreement
                All fees are non-refundable unless otherwise specified
                We may modify pricing with 30 days' notice
                Late payments may incur interest and service suspension
              
            

            
              8. Service Level and Warranties
              
                We strive to provide reliable services. However, our services are provided "AS IS" and "AS AVAILABLE" without warranties of any kind, either express or implied, including but not limited to:
              
              
                Merchantability or fitness for a particular purpose
                Uninterrupted or error-free service
                Accuracy or completeness of data
                Results or outcomes from using our services
              
            

            
              9. Limitation of Liability
              
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, PIVOTAL B2B LLC SHALL NOT BE LIABLE FOR:
              
              
                Indirect, incidental, special, consequential, or punitive damages
                Loss of profits, data, or business opportunities
                Damages arising from your use or inability to use our services
              
              
                Our total liability shall not exceed the amounts paid by you for the services in the twelve (12) months preceding the claim.
              
            

            
              10. Indemnification
              
                You agree to indemnify and hold harmless Pivotal B2B LLC, its officers, directors, employees, and agents from any claims, damages, losses, or expenses arising from:
              
              
                Your use of our services
                Your violation of these Terms
                Your violation of any third-party rights
                Your content or data submitted to our platform
              
            

            
              11. Termination
              
                Either party may terminate the service agreement:
              
              
                For convenience with 30 days' written notice
                Immediately for material breach that remains uncured after 15 days' notice
                Immediately for violation of acceptable use policies
              
              
                Upon termination, your access to services will cease, and you must stop using any data obtained through our platform.
              
            

            
              12. Governing Law and Disputes
              
                These Terms are governed by the laws of the State of Delaware, United States, without regard to conflict of law principles. Any disputes shall be resolved through:
              
              
                Good faith negotiations between the parties
                If unresolved, binding arbitration in Delaware
                Each party bears its own costs and attorney fees
              
            

            
              13. Changes to Terms
              
                We reserve the right to modify these Terms at any time. We will provide notice of material changes by posting the updated Terms on our website. Your continued use of our services after changes constitutes acceptance of the modified Terms.
              
            

            
              14. Miscellaneous
              
                Entire Agreement: These Terms constitute the entire agreement between you and Pivotal B2B LLC
                Severability: If any provision is found unenforceable, the remaining provisions remain in effect
                Waiver: Failure to enforce any provision does not constitute a waiver
                Assignment: You may not assign these Terms without our written consent
              
            

            
              15. Contact Us
              
                For questions about these Terms, please contact us:
              
              
                Pivotal B2B LLC
                Lewes, Delaware, United States
                Phone: (417) 900-3844
                Email: legal@{BRAND.domains.primary}
                Website: {BRAND.domains.primary}
              
            
          
        
      

      {/* Footer */}
      
        
          
            {FOOTER.copyright}
          
          
            Privacy Policy
            Terms of Service
            GDPR
          
        
      
    
  );
}