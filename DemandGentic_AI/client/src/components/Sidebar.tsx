import React from "react";
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Inbox,
  Link as LinkIcon,
  Send,
  Star,
  User,
} from "lucide-react";
import NavItem from "./NavItem";

export const Sidebar = () => (
  
    
      
        
        Compose
      
    

    
      } label="Inbox" count={12} active />
      } label="Starred" />
      } label="Sent" />
      } label="Archived" />
    

    
      Smart Views
    
    
      } label="Linked Deals" count={5} />
      } label="Needs Attention" count={2} />
      } label="High Intent" />
    

    
      
        
          
        
        
          Mailbox Connected
          zahid.m@pivotal-b2b.com
        
      
    
  
);

export default Sidebar;