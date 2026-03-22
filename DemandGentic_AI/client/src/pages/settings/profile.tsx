/**
 * Profile Settings Page
 *
 * User profile information management.
 */

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SettingsLayout } from '@/components/settings/settings-layout';
import { useToast } from '@/hooks/use-toast';

export default function ProfileSettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [email, setEmail] = useState(user?.email || '');

  const handleSaveProfile = async () => {
    // TODO: Implement profile update API call
    await new Promise(resolve => setTimeout(resolve, 500));

    toast({
      title: 'Profile Updated',
      description: 'Your profile information has been saved.',
    });
  };

  return (
    
      
        
          
            Profile Information
            
              Update your personal information and account details
            
          
          
            
              
                First Name
                 setFirstName(e.target.value)}
                  placeholder="John"
                  data-testid="input-first-name"
                />
              
              
                Last Name
                 setLastName(e.target.value)}
                  placeholder="Doe"
                  data-testid="input-last-name"
                />
              
            
            
              Email
               setEmail(e.target.value)}
                placeholder="john.doe@company.com"
                data-testid="input-email"
              />
            
            
              Username
              
              
                Username cannot be changed
              
            
            
              Role
              
            
            
              Save Changes
            
          
        
      
    
  );
}