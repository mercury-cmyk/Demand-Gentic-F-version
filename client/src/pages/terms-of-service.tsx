import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";

export default function TermsOfServicePage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setLocation("/welcome")}>
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-indigo-500/5 border border-violet-500/10 shrink-0">
              <div className="relative flex items-center justify-center">
                <span className="font-bold text-sm text-violet-700 tracking-tighter">PB</span>
                <Sparkles className="h-2 w-2 text-blue-500 absolute -top-1 -right-1.5" />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-lg leading-tight">Pivotal B2B</span>
              <span className="text-[10px] text-muted-foreground font-medium">Human-Led Strategy. AI-Powered Execution.</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => setLocation("/welcome")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Home
            </Button>
            <Button onClick={() => setLocation("/login")} className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700">
              Schedule Demo
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="pt-24 pb-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-2">Terms of Service</h1>
          <p className="text-muted-foreground mb-8">Last updated: February 7, 2025</p>

          <div className="prose prose-slate max-w-none">
            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">1. Agreement to Terms</h2>
              <p className="text-muted-foreground mb-4">
                These Terms of Service ("Terms") constitute a legally binding agreement between you and Pivotal B2B LLC ("Company," "we," "us," or "our"), operating as DemandGentic.ai, governing your access to and use of our website, platform, and services.
              </p>
              <p className="text-muted-foreground mb-4">
                By accessing or using our services, you agree to be bound by these Terms. If you do not agree to these Terms, you may not access or use our services.
              </p>
              <p className="text-muted-foreground mb-4">
                <strong>Company Information:</strong><br />
                Pivotal B2B LLC<br />
                Lewes, Delaware, United States<br />
                Phone: (417) 900-3844<br />
                Website: <a href="https://pivotal-b2b.com/" className="text-violet-600 hover:underline">pivotal-b2b.com</a>
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">2. Description of Services</h2>
              <p className="text-muted-foreground mb-4">
                DemandGentic.ai provides B2B demand generation services including:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
                <li>AI-powered demand generation campaigns</li>
                <li>Account-based marketing (ABM) services</li>
                <li>B2B data and intelligence services</li>
                <li>AI SDR (Sales Development Representative) services</li>
                <li>Appointment generation services</li>
                <li>Content syndication and distribution</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">3. Account Registration</h2>
              <p className="text-muted-foreground mb-4">
                To access certain features, you may need to create an account. You agree to:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
                <li>Provide accurate, current, and complete information</li>
                <li>Maintain and update your information as needed</li>
                <li>Keep your password secure and confidential</li>
                <li>Accept responsibility for all activities under your account</li>
                <li>Notify us immediately of any unauthorized access</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">4. Acceptable Use</h2>
              <p className="text-muted-foreground mb-4">You agree NOT to use our services to:</p>
              <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
                <li>Violate any applicable laws or regulations</li>
                <li>Send unsolicited communications (spam) in violation of applicable laws</li>
                <li>Infringe on intellectual property rights of others</li>
                <li>Transmit malware, viruses, or harmful code</li>
                <li>Attempt to gain unauthorized access to our systems</li>
                <li>Interfere with or disrupt our services</li>
                <li>Engage in fraudulent or deceptive practices</li>
                <li>Collect data in violation of privacy laws</li>
                <li>Use our services for consumer marketing (B2C) purposes</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">5. B2B Data Usage</h2>
              <p className="text-muted-foreground mb-4">
                Our platform provides access to B2B contact data. By using this data, you agree to:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
                <li>Use data only for legitimate B2B marketing purposes</li>
                <li>Comply with all applicable data protection laws (GDPR, CAN-SPAM, CCPA, etc.)</li>
                <li>Honor opt-out and suppression requests</li>
                <li>Not resell or redistribute the data to third parties</li>
                <li>Implement appropriate data security measures</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">6. Intellectual Property</h2>
              <p className="text-muted-foreground mb-4">
                All content, features, and functionality of our services, including but not limited to text, graphics, logos, software, and AI models, are owned by Pivotal B2B LLC and are protected by intellectual property laws.
              </p>
              <p className="text-muted-foreground mb-4">
                You retain ownership of content you submit to our platform. By submitting content, you grant us a non-exclusive, worldwide, royalty-free license to use, reproduce, and display such content as necessary to provide our services.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">7. Payment Terms</h2>
              <p className="text-muted-foreground mb-4">
                For paid services:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
                <li>Fees are specified in your service agreement or order form</li>
                <li>Payment is due according to the terms specified in your agreement</li>
                <li>All fees are non-refundable unless otherwise specified</li>
                <li>We may modify pricing with 30 days' notice</li>
                <li>Late payments may incur interest and service suspension</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">8. Service Level and Warranties</h2>
              <p className="text-muted-foreground mb-4">
                We strive to provide reliable services. However, our services are provided "AS IS" and "AS AVAILABLE" without warranties of any kind, either express or implied, including but not limited to:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
                <li>Merchantability or fitness for a particular purpose</li>
                <li>Uninterrupted or error-free service</li>
                <li>Accuracy or completeness of data</li>
                <li>Results or outcomes from using our services</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">9. Limitation of Liability</h2>
              <p className="text-muted-foreground mb-4">
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, PIVOTAL B2B LLC SHALL NOT BE LIABLE FOR:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
                <li>Indirect, incidental, special, consequential, or punitive damages</li>
                <li>Loss of profits, data, or business opportunities</li>
                <li>Damages arising from your use or inability to use our services</li>
              </ul>
              <p className="text-muted-foreground mb-4">
                Our total liability shall not exceed the amounts paid by you for the services in the twelve (12) months preceding the claim.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">10. Indemnification</h2>
              <p className="text-muted-foreground mb-4">
                You agree to indemnify and hold harmless Pivotal B2B LLC, its officers, directors, employees, and agents from any claims, damages, losses, or expenses arising from:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
                <li>Your use of our services</li>
                <li>Your violation of these Terms</li>
                <li>Your violation of any third-party rights</li>
                <li>Your content or data submitted to our platform</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">11. Termination</h2>
              <p className="text-muted-foreground mb-4">
                Either party may terminate the service agreement:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
                <li>For convenience with 30 days' written notice</li>
                <li>Immediately for material breach that remains uncured after 15 days' notice</li>
                <li>Immediately for violation of acceptable use policies</li>
              </ul>
              <p className="text-muted-foreground mb-4">
                Upon termination, your access to services will cease, and you must stop using any data obtained through our platform.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">12. Governing Law and Disputes</h2>
              <p className="text-muted-foreground mb-4">
                These Terms are governed by the laws of the State of Delaware, United States, without regard to conflict of law principles. Any disputes shall be resolved through:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
                <li>Good faith negotiations between the parties</li>
                <li>If unresolved, binding arbitration in Delaware</li>
                <li>Each party bears its own costs and attorney fees</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">13. Changes to Terms</h2>
              <p className="text-muted-foreground mb-4">
                We reserve the right to modify these Terms at any time. We will provide notice of material changes by posting the updated Terms on our website. Your continued use of our services after changes constitutes acceptance of the modified Terms.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">14. Miscellaneous</h2>
              <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
                <li><strong>Entire Agreement:</strong> These Terms constitute the entire agreement between you and Pivotal B2B LLC</li>
                <li><strong>Severability:</strong> If any provision is found unenforceable, the remaining provisions remain in effect</li>
                <li><strong>Waiver:</strong> Failure to enforce any provision does not constitute a waiver</li>
                <li><strong>Assignment:</strong> You may not assign these Terms without our written consent</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">15. Contact Us</h2>
              <p className="text-muted-foreground mb-4">
                For questions about these Terms, please contact us:
              </p>
              <p className="text-muted-foreground">
                <strong>Pivotal B2B LLC</strong><br />
                Lewes, Delaware, United States<br />
                Phone: <a href="tel:+14179003844" className="text-violet-600 hover:underline">(417) 900-3844</a><br />
                Email: <a href="mailto:legal@pivotal-b2b.com" className="text-violet-600 hover:underline">legal@pivotal-b2b.com</a><br />
                Website: <a href="https://pivotal-b2b.com/" className="text-violet-600 hover:underline">pivotal-b2b.com</a>
              </p>
            </section>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-8 px-6 bg-slate-900 text-white">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-slate-500 text-sm">
            © 2024 Pivotal B2B LLC. All rights reserved. DemandGentic.ai is a product of Pivotal B2B LLC.
          </p>
          <div className="flex justify-center gap-6 mt-4 text-slate-500 text-sm">
            <a href="/privacy" className="hover:text-white transition-colors">Privacy Policy</a>
            <span className="text-white">Terms of Service</span>
            <a href="/gdpr" className="hover:text-white transition-colors">GDPR</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
