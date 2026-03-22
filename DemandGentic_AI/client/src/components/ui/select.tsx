"use client"

import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown, ChevronUp } from "lucide-react"

import { cn } from "@/lib/utils"

const EMPTY_SELECT_ITEM_VALUE = "__RADIX_SELECT_EMPTY_VALUE__"

function hasEmptySelectItemValue(children: React.ReactNode): boolean {
  let found = false

  React.Children.forEach(children, (child) => {
    if (found || !React.isValidElement(child)) {
      return
    }

    if (child.props?.value === "") {
      found = true
      return
    }

    if (child.props?.children) {
      found = hasEmptySelectItemValue(child.props.children)
    }
  })

  return found
}

function Select({ children, value, defaultValue, onValueChange, ...props }: React.ComponentPropsWithoutRef) {
  const supportsEmptyItem = React.useMemo(() => hasEmptySelectItemValue(children), [children])

  const normalizedValue = supportsEmptyItem && value === "" ? EMPTY_SELECT_ITEM_VALUE : value
  const normalizedDefaultValue = supportsEmptyItem && defaultValue === "" ? EMPTY_SELECT_ITEM_VALUE : defaultValue

  const handleValueChange = React.useCallback(
    (nextValue: string) => {
      onValueChange?.(supportsEmptyItem && nextValue === EMPTY_SELECT_ITEM_VALUE ? "" : nextValue)
    },
    [onValueChange, supportsEmptyItem]
  )

  return (
    
      {children}
    
  )
}

const SelectGroup = SelectPrimitive.Group

const SelectValue = SelectPrimitive.Value

const SelectTrigger = React.forwardRef,
  React.ComponentPropsWithoutRef
>(({ className, children, ...props }, ref) => (
  span]:line-clamp-1",
      className
    )}
    {...props}
  >
    {children}
    
      
    
  
))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

const SelectScrollUpButton = React.forwardRef,
  React.ComponentPropsWithoutRef
>(({ className, ...props }, ref) => (
  
    
  
))
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName

const SelectScrollDownButton = React.forwardRef,
  React.ComponentPropsWithoutRef
>(({ className, ...props }, ref) => (
  
    
  
))
SelectScrollDownButton.displayName =
  SelectPrimitive.ScrollDownButton.displayName

const SelectContent = React.forwardRef,
  React.ComponentPropsWithoutRef
>(({ className, children, position = "popper", ...props }, ref) => (
  
    
      
      
        {children}
      
      
    
  
))
SelectContent.displayName = SelectPrimitive.Content.displayName

const SelectLabel = React.forwardRef,
  React.ComponentPropsWithoutRef
>(({ className, ...props }, ref) => (
  
))
SelectLabel.displayName = SelectPrimitive.Label.displayName

const SelectItem = React.forwardRef,
  React.ComponentPropsWithoutRef
>(({ className, children, value, ...props }, ref) => (
  
    
      
        
      
    

    {children}
  
))
SelectItem.displayName = SelectPrimitive.Item.displayName

const SelectSeparator = React.forwardRef,
  React.ComponentPropsWithoutRef
>(({ className, ...props }, ref) => (
  
))
SelectSeparator.displayName = SelectPrimitive.Separator.displayName

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
}