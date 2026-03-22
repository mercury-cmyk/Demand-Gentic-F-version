import React from "react";
import {
  Archive,
  Clock,
  Forward,
  Inbox,
  Link as LinkIcon,
  MoreHorizontal,
  Reply,
  Sparkles,
} from "lucide-react";

export const ReadingPane = ({ thread }) => (
  
    {thread ? (
      
        
          
            
              
            
            
              
            
            
              
            
            
            
              
              Link to Opportunity
            
          
          
            
          
        

        
          
            
              
              AI Conversation Summary
            
            
              Mark is evaluating the pilot scope and comparing vendors. He is positive about the
              transparency and wants a discovery call this week.
               Action: Share the updated
              timeline and confirm Wednesday availability.
            
            
              
                Next step: Discovery call
              
              
                Confidence: 84%
              
            
          

          
            
              
                {thread.avatar}
              
              
                {thread.sender}
                
                  To: Zahid Mohammadi &lt;zahid.m@pivotal-b2b.com&gt;
                
              
            
            
              {thread.time}
              Oct 26, 2023
            
          

          
            
              Opportunity: {thread.opportunity}
            
            
              Stage: {thread.stage}
            
            
              Health: On track
            
          

          
            
              Hi Zahid,
              
                Thanks for the proposal. We are reviewing the pilot scope internally and
                comparing it with another vendor. The transparency in your plan is a strong
                signal for us.
              
              
                If possible, we would like to schedule a short discovery call this week so we
                can align on timelines, deliverables, and the success metrics you mentioned.
              
              
                Confirm pilot objectives and stakeholders
                Review data requirements and integration steps
                Align on launch timing and milestones
              
              
                Best regards,
                
                Mark Johnson
              
            
          

          
            
            
              
                
                  
                
                
                  
                
              
              
                Send Reply
              
            
          
        
      
    ) : (
      
        
          
          Select a conversation to read
        
      
    )}
  
);

export default ReadingPane;