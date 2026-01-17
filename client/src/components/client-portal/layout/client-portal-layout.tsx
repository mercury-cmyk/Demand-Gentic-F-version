import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  LayoutDashboard,
  FolderKanban,
  Megaphone,
  ShoppingCart,
  CreditCard,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Mic,
} from 'lucide-react';
import { VoiceAssistant } from '../voice/voice-assistant';

interface ClientUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  clientAccountId: string;
  clientAccountName: string;
}

interface ClientPortalLayoutProps {
  children: React.ReactNode;
}

const navigation = [
  { name: 'Dashboard', href: '/client-portal/dashboard', icon: LayoutDashboard },
  { name: 'Projects', href: '/client-portal/projects', icon: FolderKanban },
  { name: 'Campaigns', href: '/client-portal/campaigns', icon: Megaphone },
  { name: 'Orders', href: '/client-portal/orders', icon: ShoppingCart },
  { name: 'Billing', href: '/client-portal/billing', icon: CreditCard },
  { name: 'Settings', href: '/client-portal/settings', icon: Settings },
];

export function ClientPortalLayout({ children }: ClientPortalLayoutProps) {
  const [location, setLocation] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);

  const storedUser = localStorage.getItem('clientPortalUser');
  const user: ClientUser | null = storedUser ? JSON.parse(storedUser) : null;

  const handleLogout = () => {
    localStorage.removeItem('clientPortalToken');
    localStorage.removeItem('clientPortalUser');
    setLocation('/client-portal/login');
  };

  const getInitials = () => {
    if (!user) return '?';
    const first = user.firstName?.[0] || '';
    const last = user.lastName?.[0] || '';
    return (first + last).toUpperCase() || user.email[0].toUpperCase();
  };

  const handleVoiceNavigation = (path: string) => {
    setVoiceOpen(false);
    setLocation(path);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-card border-r transform transition-transform duration-200 ease-in-out lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center justify-between px-4 border-b">
          <Link href="/client-portal/dashboard">
            <span className="text-lg font-semibold text-primary cursor-pointer">
              Client Portal
            </span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1">
          {navigation.map((item) => {
            const isActive = location.startsWith(item.href);
            return (
              <Link key={item.name} href={item.href}>
                <span
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium cursor-pointer transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon className="h-5 w-5" />
                  {item.name}
                  {isActive && <ChevronRight className="h-4 w-4 ml-auto" />}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Account info at bottom */}
        {user && (
          <div className="border-t p-4">
            <div className="text-xs text-muted-foreground mb-1">Organization</div>
            <div className="text-sm font-medium truncate">{user.clientAccountName}</div>
          </div>
        )}
      </aside>

      {/* Main content area */}
      <div className="lg:pl-64">
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          <div className="flex-1" />

          {/* Voice Assistant Button */}
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setVoiceOpen(true)}
          >
            <Mic className="h-4 w-4" />
            <span className="hidden sm:inline">Voice Assistant</span>
          </Button>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {getInitials()}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="flex items-center justify-start gap-2 p-2">
                <div className="flex flex-col space-y-0.5">
                  <p className="text-sm font-medium">
                    {user?.firstName} {user?.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/client-portal/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6">{children}</main>
      </div>

      {/* Voice Assistant Modal */}
      <VoiceAssistant
        open={voiceOpen}
        onOpenChange={setVoiceOpen}
        onNavigate={handleVoiceNavigation}
      />
    </div>
  );
}
