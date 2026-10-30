{{/*
The start of every object's name: the release name, plus the chart's name
unless the release name has it already. Short enough for a CronJob's Jobs.
*/}}
{{- define "splunk-events.fullname" -}}
{{- if contains .Chart.Name .Release.Name -}}
{{- .Release.Name | trunc 40 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 40 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "splunk-events.selectorLabels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "splunk-events.labels" -}}
{{ include "splunk-events.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end -}}

{{/* An image: registry/name:tag. Call with (dict "root" $ "name" .Values.image.app). */}}
{{- define "splunk-events.image" -}}
{{- $tag := .root.Values.image.tag | default .root.Chart.AppVersion -}}
{{- with .root.Values.image.registry -}}
{{- printf "%s/%s:%s" (trimSuffix "/" .) $.name $tag -}}
{{- else -}}
{{- printf "%s:%s" .name $tag -}}
{{- end -}}
{{- end -}}

{{/* The app's Secret: one the platform provides, or the one this chart makes. */}}
{{- define "splunk-events.secretName" -}}
{{- .Values.secrets.existingSecret | default (printf "%s-secrets" (include "splunk-events.fullname" .)) -}}
{{- end -}}

{{/* A variable from the app's Secret. Call with (dict "root" $ "key" "MONGODB_URI" "optional" true). */}}
{{- define "splunk-events.secretEnv" -}}
- name: {{ .key }}
  valueFrom:
    secretKeyRef:
      name: {{ include "splunk-events.secretName" .root }}
      key: {{ .key }}
      {{- if .optional }}
      optional: true
      {{- end }}
{{- end -}}

{{/* Every process sets this the same way: it's an option of the runs' index. */}}
{{- define "splunk-events.retentionEnv" -}}
{{- with .Values.runRetentionDays -}}
- name: RUN_RETENTION_DAYS
  value: {{ . | quote }}
{{- end -}}
{{- end -}}

{{/* The web app's address inside the cluster, for the jobs' cache refresh. */}}
{{- define "splunk-events.webUrl" -}}
http://{{ include "splunk-events.fullname" . }}-web:3000
{{- end -}}

{{/* Non-root, with no fixed user, so OpenShift's restricted policy accepts it. */}}
{{- define "splunk-events.podSecurityContext" -}}
runAsNonRoot: true
seccompProfile:
  type: RuntimeDefault
{{- end -}}

{{- define "splunk-events.containerSecurityContext" -}}
allowPrivilegeEscalation: false
capabilities:
  drop: ["ALL"]
{{- end -}}
