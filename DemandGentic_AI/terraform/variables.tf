# Variables for Terraform GCP deployment

variable "gcp_project_id" {
  type        = string
  description = "GCP Project ID"
}

variable "gcp_region" {
  type        = string
  default     = "us-central1"
  description = "GCP region for resources"
}

variable "machine_type" {
  type        = string
  default     = "e2-standard-4"
  description = "GCP compute instance machine type"
}

variable "ssh_source_cidr" {
  type        = string
  default     = "0.0.0.0/0"
  description = "CIDR for SSH access (restrict to your IP for security)"
}

variable "public_ip" {
  type        = string
  description = "Public IP address (assigned by GCP)"
  default     = ""
}

variable "github_token" {
  type        = string
  sensitive   = true
  description = "GitHub personal access token for cloning private repositories"
}

variable "gemini_api_key" {
  type        = string
  sensitive   = true
  description = "Google Gemini API key"
}

variable "database_url" {
  type        = string
  sensitive   = true
  description = "Database connection URL"
}

variable "redis_url" {
  type        = string
  sensitive   = true
  description = "Redis connection URL"
}

variable "turn_username" {
  type        = string
  default     = "turnuser"
  description = "TURN server username"
}

variable "turn_password" {
  type        = string
  sensitive   = true
  description = "TURN server password"
}

variable "create_database" {
  type        = bool
  default     = true
  description = "Whether to create Cloud SQL database"
}

variable "create_redis" {
  type        = bool
  default     = true
  description = "Whether to create Cloud Redis instance"
}

variable "db_user" {
  type        = string
  default     = "demandgentic"
  description = "Database user name"
}

variable "db_password" {
  type        = string
  sensitive   = true
  description = "Database password"
}