# {{ .name }}

**_Tier {{ .tier }}_** _{{ .examples }}_

- **Trait Bonus:** {{ .trait_bonus }}
- **Evasion Bonus:** {{ .evasion_bonus }}
- **Attack:** {{ .attack }}
- **Advantages:** {{ .advantages }}

### FEATURES

{{- range .feature }}

**_{{ .name }}:_** {{ .text }}
{{- end }}
