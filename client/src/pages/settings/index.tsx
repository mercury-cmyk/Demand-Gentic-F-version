/**
 * Settings Hub Index Page
 *
 * Main landing page for the Settings Hub. Shows overview of all settings areas.
 */

import { Link } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SettingsLayout, SETTINGS_NAV, CATEGORIES } from '@/components/settings/settings-layout';
import { ChevronRight } from 'lucide-react';

export default function SettingsIndexPage() {
  return (
    <SettingsLayout
      title="Settings"
      description="Manage your account, organization, and system preferences"
    >
      <div className="space-y-8">
        {CATEGORIES.map(category => {
          const items = SETTINGS_NAV.filter(item => item.category === category.id);
          if (items.length === 0) return null;

          return (
            <div key={category.id}>
              <h2 className="text-lg font-semibold mb-4">{category.label} Settings</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {items.map(item => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.id} href={item.href}>
                      <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-lg bg-primary/10">
                                <Icon className="h-5 w-5 text-primary" />
                              </div>
                              <CardTitle className="text-base">{item.label}</CardTitle>
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          </div>
                        </CardHeader>
                        <CardContent>
                          <CardDescription>{item.description}</CardDescription>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </SettingsLayout>
  );
}
