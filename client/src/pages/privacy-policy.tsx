import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";

export default function PrivacyPolicyPage() {
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
          <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
          <p className="text-muted-foreground mb-8">Last updated: February 7, 2025</p>

          <div className="prose prose-slate max-w-none">
            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
              <p className="text-muted-foreground mb-4">
                Pivotal B2B LLC ("Company," "we," "us," or "our"), respects your privacy and is committed to protecting your personal data. This privacy policy explains how we collect, use, disclose, and safeguard your information when you visit our website or use our services.
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
              <h2 className="text-2xl font-semibold mb-4">2. Information We Collect</h2>
              <h3 className="text-xl font-medium mb-3">2.1 Personal Data</h3>
              <p className="text-muted-foreground mb-4">We may collect the following types of personal information:</p>
              <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
                <li>Contact information (name, email address, phone number, company name, job title)</li>
                <li>Account credentials (username, password)</li>
                <li>Billing information (payment details, billing address)</li>
                <li>Communication preferences</li>
                <li>Usage data and analytics</li>
              </ul>

              <h3 className="text-xl font-medium mb-3">2.2 B2B Contact Data</h3>
              <p className="text-muted-foreground mb-4">
                As a B2B demand generation platform, we maintain a database of business contact information sourced from publicly available sources, data partners, and user-provided data. This data is used exclusively for legitimate B2B marketing purposes.
              </p>

              <h3 className="text-xl font-medium mb-3">2.3 Automatically Collected Data</h3>
              <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
                <li>IP address and device information</li>
                <li>Browser type and version</li>
                <li>Pages visited and time spent</li>
                <li>Referring website addresses</li>
                <li>Cookies and similar tracking technologies</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">3. How We Use Your Information</h2>
              <p className="text-muted-foreground mb-4">We use collected information for the following purposes:</p>
              <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
                <li>To provide and maintain our services</li>
                <li>To process transactions and send related information</li>
                <li>To send promotional communications (with your consent)</li>
                <li>To respond to inquiries and provide customer support</li>
                <li>To improve our website and services</li>
                <li>To comply with legal obligations</li>
                <li>To detect and prevent fraud or security issues</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">4. Legal Basis for Processing (GDPR)</h2>
              <p className="text-muted-foreground mb-4">Under the GDPR, we process personal data based on the following legal grounds:</p>
              <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
                <li><strong>Consent:</strong> Where you have given explicit consent for specific purposes</li>
                <li><strong>Contract:</strong> Where processing is necessary to perform a contract with you</li>
                <li><strong>Legitimate Interest:</strong> Where processing is necessary for our legitimate business interests, provided these do not override your rights</li>
                <li><strong>Legal Obligation:</strong> Where processing is required to comply with applicable laws</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">5. Data Sharing and Disclosure</h2>
              <p className="text-muted-foreground mb-4">We may share your information with:</p>
              <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
                <li><strong>Service Providers:</strong> Third-party vendors who assist in operating our platform</li>
                <li><strong>Business Partners:</strong> With your consent, for co-marketing purposes</li>
                <li><strong>Legal Requirements:</strong> When required by law or to protect our rights</li>
                <li><strong>Business Transfers:</strong> In connection with mergers, acquisitions, or asset sales</li>
              </ul>
              <p className="text-muted-foreground mb-4">
                We do not sell your personal information to third parties.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">6. Data Security</h2>
              <p className="text-muted-foreground mb-4">
                We implement appropriate technical and organizational security measures to protect your personal data, including:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
                <li>Encryption of data in transit and at rest</li>
                <li>Regular security assessments and audits</li>
                <li>Access controls and authentication measures</li>
                <li>Employee training on data protection</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">7. Data Retention</h2>
              <p className="text-muted-foreground mb-4">
                We retain personal data only for as long as necessary to fulfill the purposes for which it was collected, or as required by law. When data is no longer needed, it is securely deleted or anonymized.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">8. Your Rights</h2>
              <p className="text-muted-foreground mb-4">Depending on your location, you may have the following rights:</p>
              <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
                <li><strong>Access:</strong> Request a copy of your personal data</li>
                <li><strong>Rectification:</strong> Request correction of inaccurate data</li>
                <li><strong>Erasure:</strong> Request deletion of your data ("right to be forgotten")</li>
                <li><strong>Restriction:</strong> Request limitation of processing</li>
                <li><strong>Portability:</strong> Request transfer of your data to another service</li>
                <li><strong>Objection:</strong> Object to processing based on legitimate interests</li>
                <li><strong>Withdraw Consent:</strong> Withdraw previously given consent</li>
              </ul>
              <p className="text-muted-foreground mb-4">
                To exercise these rights, please contact us at <a href="mailto:privacy@pivotal-b2b.com" className="text-violet-600 hover:underline">privacy@pivotal-b2b.com</a>.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">9. Cookies</h2>
              <p className="text-muted-foreground mb-4">
                We use cookies and similar tracking technologies to enhance your experience. You can manage cookie preferences through your browser settings. For more details, see our Cookie Policy section.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">10. International Data Transfers</h2>
              <p className="text-muted-foreground mb-4">
                Your data may be transferred to and processed in countries outside your jurisdiction. We ensure appropriate safeguards are in place, including Standard Contractual Clauses where required.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">11. Children's Privacy</h2>
              <p className="text-muted-foreground mb-4">
                Our services are not directed to individuals under 18 years of age. We do not knowingly collect personal information from children.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">12. Changes to This Policy</h2>
              <p className="text-muted-foreground mb-4">
                We may update this privacy policy from time to time. We will notify you of any material changes by posting the new policy on this page and updating the "Last updated" date.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">13. Contact Us</h2>
              <p className="text-muted-foreground mb-4">
                If you have questions about this privacy policy or our data practices, please contact us:
              </p>
              <p className="text-muted-foreground">
                <strong>Pivotal B2B LLC</strong><br />
                Lewes, Delaware, United States<br />
                Phone: <a href="tel:+14179003844" className="text-violet-600 hover:underline">(417) 900-3844</a><br />
                Email: <a href="mailto:privacy@pivotal-b2b.com" className="text-violet-600 hover:underline">privacy@pivotal-b2b.com</a><br />
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
            © 2024 Pivotal B2B LLC. All rights reserved.
          </p>
          <div className="flex justify-center gap-6 mt-4 text-slate-500 text-sm">
            <span className="text-white">Privacy Policy</span>
            <a href="/terms" className="hover:text-white transition-colors">Terms of Service</a>
            <a href="/gdpr" className="hover:text-white transition-colors">GDPR</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
