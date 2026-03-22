import React from "react";

export const NavItem = ({
  icon,
  label,
  count,
  active = false,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active?: boolean;
}) => (
  
    
      {icon}
      {label}
    
    {count ? (
      
        {count}
      
    ) : null}
  
);

export default NavItem;