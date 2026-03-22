import { useState, useEffect } from 'react';
import { useLocation, Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Lock, User, Loader2, Sparkles, CheckCircle2, XCircle, Eye, EyeOff, ShieldCheck } from 'lucide-react';

interface InviteUser {
  email: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string;
}

export default function ClientPortalAcceptInvite() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const clientPortalLoginPath = '/client-portal/login';

  // Token from URL
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') || '';

  // State
  const [isValidating, setIsValidating] = useState(true);
  const [isValid, setIsValid] = useState(false);
  const [invalidReason, setInvalidReason] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [user, setUser] = useState(null);

  // Form fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  // Password strength
  const passwordChecks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
  };
  const passwordStrength = Object.values(passwordChecks).filter(Boolean).length;

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setIsValidating(false);
      setIsValid(false);
      setInvalidReason('No invitation token provided. Please use the link from your invitation email.');
      return;
    }

    const validateToken = async () => {
      try {
        const response = await fetch('/api/communications/invitations/validate-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        const data = await response.json();

        if (data.valid && data.user) {
          setIsValid(true);
          setUser(data.user);
          setFirstName(data.user.firstName || '');
          setLastName(data.user.lastName || '');
        } else {
          setIsValid(false);
          setInvalidReason(data.reason || 'This invitation link is invalid or has expired. Please contact your administrator for a new invitation.');
          setErrorCode(data.errorCode || '');
        }
      } catch {
        setIsValid(false);
        setInvalidReason('Unable to validate your invitation. Please check your connection and try again.');
      } finally {
        setIsValidating(false);
      }
    };

    validateToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }

    if (passwordStrength 
        
        
          
            
            Validating your invitation...
          
        
      
    );
  }

  // Invalid token state
  if (!isValid) {
    return (
      
        
        
          
            
              
            
            Invitation Invalid
            {invalidReason}
            
              {errorCode === 'TOKEN_USED' ? (
                
                  Go to Login
                
              ) : (
                
                  Go to Login
                
              )}
            
          
        
      
    );
  }

  // Success state
  if (isComplete) {
    return (
      
        
        
        
          
            
              
            
            You're All Set!
            
              Welcome to the {user?.companyName} portal.
            
            
              Your password has been set. You can now log in with your email.
            
            
              
                Log In to Your Portal
              
            
          
        
      
    );
  }

  // Setup form
  return (
    
      {/* Background */}
      
      
      

      
        
          
            
              
                PB
                
              
            
          
          Set Up Your Account
          
            Complete your profile for the {user?.companyName} workspace
          
          {user?.email && (
            
              {user.email}
            
          )}
        

        
          
            {/* Name fields */}
            
              
                First Name
                
                  
                   setFirstName(e.target.value)}
                    placeholder="Jane"
                    required
                    className="pl-10"
                  />
                
              
              
                Last Name
                 setLastName(e.target.value)}
                  placeholder="Smith"
                  required
                />
              
            

            {/* Password */}
            
              Create Password
              
                
                 setPassword(e.target.value)}
                  placeholder="Choose a strong password"
                  required
                  className="pl-10 pr-10"
                />
                 setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ?  : }
                
              

              {/* Password strength indicator */}
              {password.length > 0 && (
                
                  
                    {[1, 2, 3, 4].map((level) => (
                      = level
                            ? passwordStrength 
                    ))}
                  
                  
                    {[
                      { check: passwordChecks.length, label: '8+ characters' },
                      { check: passwordChecks.uppercase, label: 'Uppercase letter' },
                      { check: passwordChecks.lowercase, label: 'Lowercase letter' },
                      { check: passwordChecks.number, label: 'Number' },
                    ].map(({ check, label }) => (
                      
                        {check ?  : }
                        {label}
                      
                    ))}
                  
                
              )}
            

            {/* Confirm Password */}
            
              Confirm Password
              
                
                 setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  required
                  className="pl-10"
                />
              
              {confirmPassword.length > 0 && password !== confirmPassword && (
                
                   Passwords do not match
                
              )}
            
          

          
            
              {isSubmitting ? (
                <>
                  
                  Setting up your account...
                
              ) : (
                'Complete Setup'
              )}
            
            
              Already have an account?{' '}
              
                Log in instead
              
            
          
        
      
    
  );
}