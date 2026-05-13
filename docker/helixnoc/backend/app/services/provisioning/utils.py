import re

def safe_render_template(template: str, variables: dict) -> str:
    """
    Renderiza un template reemplazando de forma segura los placeholders {llave}.
    
    Reglas:
    - Solo permite caracteres alfanuméricos, guiones y guiones bajos en los placeholders.
    - Rechaza cualquier valor que pueda contener comandos concatenados (ej. delimitadores como ;, &, |).
    """
    
    # 1. Encontrar todos los placeholders en el template
    placeholders = re.findall(r'\{([A-Za-z0-9_]+)\}', template)
    
    # Normalizar keys a minusculas
    normalized_vars = {k.lower(): v for k, v in variables.items()}
    
    # 2. Validar que tengamos las variables necesarias
    missing = [p for p in placeholders if p.lower() not in normalized_vars]
    if missing:
        raise ValueError(f"Faltan variables para renderizar el template: {', '.join(missing)}")
        
    rendered = template
    for key in placeholders:
        val = str(normalized_vars[key.lower()])
        
        # 3. Sanitizar valor para evitar shell injection o bad inputs
        if re.search(r'[;&|`"\$]', val):
            raise ValueError(f"El valor de la variable '{key}' contiene caracteres prohibidos.")
            
        # Reemplazar la variable en el template
        rendered = rendered.replace(f"{{{key}}}", val)
        
    return rendered
