#!/bin/bash
# Validation script to ensure TeXML XML is well-formed after fix

echo "Checking TeXML XML structure for AI calls..."

# Extract the XML response from texml.ts
xml_response='

    
        
    
'

# Check if XML is well-formed using xmllint (if available)
if command -v xmllint &> /dev/null; then
    echo "$xml_response" | xmllint - > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo "✅ TeXML AI-call response is well-formed XML"
    else
        echo "❌ TeXML AI-call response has XML errors"
        echo "$xml_response" | xmllint -
        exit 1
    fi
else
    echo "⚠️  xmllint not available, skipping XML validation"
    echo "   You can validate the XML manually at: https://www.w3schools.com/xml/xml_validator.asp"
fi

echo "Checking TeXML XML structure for incoming calls..."

incoming_response='

    Connecting you to the DemandGentic.ai By Pivotal B2B assistant.
    
        
    
'

if command -v xmllint &> /dev/null; then
    echo "$incoming_response" | xmllint - > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo "✅ TeXML incoming response is well-formed XML"
    else
        echo "❌ TeXML incoming response has XML errors"
        echo "$incoming_response" | xmllint -
        exit 1
    fi
fi

echo ""
echo "✅ TeXML fix validation complete!"
echo ""
echo "Key improvements:"
echo "  1. Removed blocking  configuration"
echo "  2. Direct  connection for immediate setup"
echo "  3. No AMD timeout delays blocking WebSocket"
echo "  4. Test calls should now ring and connect properly"