import os

env_file = ".env.local"
output_file = "env_vars.yaml"

ignored_keys = {"PORT", "NODE_ENV"}

with open(env_file, 'r', encoding='utf-8') as f:
    lines = f.readlines()

env_dict = {}
for line in lines:
    line = line.strip()
    if not line or line.startswith('#'):
        continue
    
    # Handle optional quotes and export keyword
    if line.startswith('export '):
        line = line[7:]
    
    if '=' in line:
        key, value = line.split('=', 1)
        key = key.strip()
        value = value.strip()
        
        # Remove surrounding quotes if present
        if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
            value = value[1:-1]
            
        if key not in ignored_keys:
            env_dict[key] = value

# Basic validation
if "DATABASE_URL" not in env_dict:
    print("WARNING: DATABASE_URL not found in .env.local")

with open(output_file, 'w', encoding='utf-8') as f:
    for key, value in env_dict.items():
        # Simple YAML escaping: quote string
        f.write(f'{key}: "{value}"\n')

print(f"Created {output_file} with {len(env_dict)} variables.")