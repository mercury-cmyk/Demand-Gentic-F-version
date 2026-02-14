import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { BRAND, FOOTER } from "@shared/brand-messaging";

export default function GDPRPolicyPage() {
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
              <span className="text-[10px] text-muted-foreground font-medium">DemandGentic---Human-Led Strategy. AI-Powered Execution.</span>
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
          <h1 className="text-4xl font-bold mb-2">GDPR Compliance</h1>
          <p className="text-muted-foreground mb-8">Last updated: February 7, 2025</p>

          <div className="prose prose-slate max-w-none">
            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">1. Our Commitment to GDPR</h2>
              <p className="text-muted-foreground mb-4">
                {BRAND.company.legalName} ("Company," "we," "us," or "our"), operating as {BRAND.company.productName}, is committed to complying with the General Data Protection Regulation (GDPR) and protecting the personal data of individuals in the European Economic Area (EEA) and United Kingdom (UK).
              </p>
              <p className="text-muted-foreground mb-4">
                <strong>Data Controller Information:</strong><br />
                {BRAND.company.legalName}<br />
                Lewes, Delaware, United States<br />
                Phone: (417) 900-3844<br />
                Email: <a href="mailto:privacy@demandgentic.ai" className="text-violet-600 hover:underline">privacy@demandgentic.ai</a>
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">2. Data We Process</h2>
              <h3 className="text-xl font-medium mb-3">2.1 Categories of Personal Data</h3>
              <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
                <li><strong>Identity Data:</strong> Name, job title, company name</li>
                <li><strong>Contact Data:</strong> Business email address, phone number, business address</li>
                <li><strong>Technical Data:</strong> IP address, browser type, device information</li>
                <li><strong>Usage Data:</strong> Information about how you use our website and services</li>
                <li><strong>Marketing Data:</strong> Preferences for receiving marketing communications</li>
              </ul>

              <h3 className="text-xl font-medium mb-3">2.2 Special Categories of Data</h3>
              <p className="text-muted-foreground mb-4">
                We do not intentionally collect or process special categories of personal data (such as racial or ethnic origin, political opinions, religious beliefs, health data, etc.).
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">3. Legal Basis for Processing</h2>
              <p className="text-muted-foreground mb-4">
                Under GDPR, we process personal data based on the following legal grounds:
              </p>

              <div className="bg-slate-50 p-6 rounded-lg mb-4">
                <h3 className="text-lg font-medium mb-3">Consent (Article 6(1)(a))</h3>
                <p className="text-muted-foreground">
                  Where you have given explicit consent for specific purposes, such as receiving marketing communications or participating in surveys.
                </p>
              </div>

              <div className="bg-slate-50 p-6 rounded-lg mb-4">
                <h3 className="text-lg font-medium mb-3">Contract Performance (Article 6(1)(b))</h3>
                <p className="text-muted-foreground">
                  Where processing is necessary to perform a contract with you or take steps at your request before entering into a contract.
                </p>
              </div>

              <div className="bg-slate-50 p-6 rounded-lg mb-4">
                <h3 className="text-lg font-medium mb-3">Legitimate Interest (Article 6(1)(f))</h3>
                <p className="text-muted-foreground">
                  For B2B marketing purposes where we have a legitimate interest in promoting our services to business professionals, provided this does not override your fundamental rights and freedoms.
                </p>
              </div>

              <div className="bg-slate-50 p-6 rounded-lg mb-4">
                <h3 className="text-lg font-medium mb-3">Legal Obligation (Article 6(1)(c))</h3>
                <p className="text-muted-foreground">
                  Where processing is required to comply with applicable laws and regulations.
                </p>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">4. Your GDPR Rights</h2>
              <p className="text-muted-foreground mb-4">
                Under GDPR, you have the following rights regarding your personal data:
              </p>

              <div className="space-y-4">
                <div className="border-l-4 border-violet-500 pl-4">
                  <h3 className="font-semibold">Right of Access (Article 15)</h3>
                  <p className="text-muted-foreground text-sm">You can request a copy of your personal data and information about how it is processed.</p>
                </div>

                <div className="border-l-4 border-violet-500 pl-4">
                  <h3 className="font-semibold">Right to Rectification (Article 16)</h3>
                  <p className="text-muted-foreground text-sm">You can request correction of inaccurate or incomplete personal data.</p>
                </div>

                <div className="border-l-4 border-violet-500 pl-4">
                  <h3 className="font-semibold">Right to Erasure (Article 17)</h3>
                  <p className="text-muted-foreground text-sm">You can request deletion of your personal data in certain circumstances ("right to be forgotten").</p>
                </div>

                <div className="border-l-4 border-violet-500 pl-4">
                  <h3 className="font-semibold">Right to Restriction (Article 18)</h3>
                  <p className="text-muted-foreground text-sm">You can request limitation of processing in certain circumstances.</p>
                </div>

                <div className="border-l-4 border-violet-500 pl-4">
                  <h3 className="font-semibold">Right to Data Portability (Article 20)</h3>
                  <p className="text-muted-foreground text-sm">You can request your data in a structured, machine-readable format for transfer to another service.</p>
                </div>

                <div className="border-l-4 border-violet-500 pl-4">
                  <h3 className="font-semibold">Right to Object (Article 21)</h3>
                  <p className="text-muted-foreground text-sm">You can object to processing based on legitimate interests, including direct marketing.</p>
                </div>

                <div className="border-l-4 border-violet-500 pl-4">
                  <h3 className="font-semibold">Right to Withdraw Consent (Article 7)</h3>
                  <p className="text-muted-foreground text-sm">You can withdraw consent at any time where processing is based on consent.</p>
                </div>

                <div className="border-l-4 border-violet-500 pl-4">
                  <h3 className="font-semibold">Right to Lodge a Complaint (Article 77)</h3>
                  <p className="text-muted-foreground text-sm">You can lodge a complaint with a supervisory authority in your country of residence.</p>
                </div>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">5. How to Exercise Your Rights</h2>
              <p className="text-muted-foreground mb-4">
                To exercise any of your GDPR rights, please contact us using one of the following methods:
              </p>
              <div className="bg-violet-50 p-6 rounded-lg mb-4">
                <p className="text-muted-foreground">
                  <strong>Email:</strong> <a href="mailto:privacy@demandgentic.ai" className="text-violet-600 hover:underline">privacy@demandgentic.ai</a><br />
                  <strong>Phone:</strong> <a href="tel:+14179003844" className="text-violet-600 hover:underline">(417) 900-3844</a><br />
                  <strong>Subject Line:</strong> "GDPR Rights Request"
                </p>
              </div>
              <p className="text-muted-foreground mb-4">
                We will respond to your request within 30 days. In complex cases, we may extend this period by an additional 60 days, in which case we will notify you.
              </p>
              <p className="text-muted-foreground mb-4">
                We may need to verify your identity before processing your request. This is to ensure we are sharing personal data with the correct individual.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">6. International Data Transfers</h2>
              <p className="text-muted-foreground mb-4">
                As a US-based company, your personal data may be transferred to and processed in the United States. We ensure appropriate safeguards are in place for such transfers:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
                <li><strong>Standard Contractual Clauses (SCCs):</strong> We use EU-approved SCCs for data transfers to non-adequate countries</li>
                <li><strong>Data Processing Agreements:</strong> We have appropriate agreements with all data processors</li>
                <li><strong>Security Measures:</strong> We implement technical and organizational measures to protect data</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">7. Data Retention</h2>
              <p className="text-muted-foreground mb-4">
                We retain personal data only for as long as necessary:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
                <li><strong>Customer data:</strong> Duration of the business relationship plus 7 years for legal/tax purposes</li>
                <li><strong>Marketing data:</strong> Until consent is withdrawn or you object to processing</li>
                <li><strong>Website analytics:</strong> 26 months</li>
                <li><strong>Suppression lists:</strong> Indefinitely to honor opt-out requests</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">8. Data Security</h2>
              <p className="text-muted-foreground mb-4">
                We implement appropriate technical and organizational measures to ensure a level of security appropriate to the risk, including:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
                <li>Encryption of personal data in transit and at rest</li>
                <li>Regular security testing and assessments</li>
                <li>Access controls and authentication measures</li>
                <li>Employee training on data protection</li>
                <li>Incident response and breach notification procedures</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">9. Data Breach Notification</h2>
              <p className="text-muted-foreground mb-4">
                In the event of a personal data breach that is likely to result in a risk to your rights and freedoms, we will:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
                <li>Notify the relevant supervisory authority within 72 hours</li>
                <li>Notify affected individuals without undue delay if there is a high risk</li>
                <li>Document all breaches and remedial actions taken</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">10. Cookies and Tracking</h2>
              <p className="text-muted-foreground mb-4">
                We use cookies and similar technologies on our website. For EEA/UK visitors, we obtain consent before placing non-essential cookies. You can manage your cookie preferences through our cookie banner or browser settings.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">11. Sub-Processors</h2>
              <p className="text-muted-foreground mb-4">
                We engage third-party sub-processors to help deliver our services. All sub-processors are bound by data processing agreements that ensure GDPR-compliant processing. A list of our sub-processors is available upon request.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">12. Data Protection Officer</h2>
              <p className="text-muted-foreground mb-4">
                For any data protection inquiries, please contact:
              </p>
              <p className="text-muted-foreground">
                <strong>Data Protection Contact</strong><br />
                {BRAND.company.legalName}<br />
                Email: <a href="mailto:privacy@demandgentic.ai" className="text-violet-600 hover:underline">privacy@demandgentic.ai</a><br />
                Phone: <a href="tel:+14179003844" className="text-violet-600 hover:underline">(417) 900-3844</a>
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">13. Supervisory Authority</h2>
              <p className="text-muted-foreground mb-4">
                You have the right to lodge a complaint with a supervisory authority. If you are in the EEA, you can contact the supervisory authority in your country of residence. A list of EEA supervisory authorities is available at:
              </p>
              <p className="text-muted-foreground">
                <a href="https://edpb.europa.eu/about-edpb/about-edpb/members_en" target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:underline">
                  European Data Protection Board - Members
                </a>
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">14. Updates to This Policy</h2>
              <p className="text-muted-foreground mb-4">
                We may update this GDPR compliance statement from time to time. We will notify you of any material changes by posting the updated policy on our website.
              </p>
            </section>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-8 px-6 bg-slate-900 text-white">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-slate-500 text-sm">
            {FOOTER.copyright}
          </p>
          <div className="flex justify-center gap-6 mt-4 text-slate-500 text-sm">
            <a href="/privacy" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="/terms" className="hover:text-white transition-colors">Terms of Service</a>
            <span className="text-white">GDPR</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
