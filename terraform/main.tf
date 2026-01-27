# Terraform configuration for deploying Drachtio SIP server on GCP

terraform {
  required_version = ">= 1.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  # Uncomment for remote state (recommended for production)
  # backend "gcs" {
  #   bucket = "my-terraform-state"
  #   prefix = "demandgentic/sip"
  # }
}

provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

# Network
resource "google_compute_network" "sip_network" {
  name                    = "sip-server-network"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "sip_subnet" {
  name          = "sip-server-subnet"
  ip_cidr_range = "10.0.1.0/24"
  region        = var.gcp_region
  network       = google_compute_network.sip_network.id
}

# Firewall Rules
resource "google_compute_firewall" "sip_allow" {
  name    = "sip-allow-sip"
  network = google_compute_network.sip_network.id

  allow {
    protocol = "udp"
    ports    = ["5060", "5061"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["sip-server"]
}

resource "google_compute_firewall" "rtp_allow" {
  name    = "sip-allow-rtp"
  network = google_compute_network.sip_network.id

  allow {
    protocol = "udp"
    ports    = ["10000-20000"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["sip-server"]
}

resource "google_compute_firewall" "turn_allow" {
  name    = "sip-allow-turn"
  network = google_compute_network.sip_network.id

  allow {
    protocol = "udp"
    ports    = ["3478", "5349"]
  }

  allow {
    protocol = "tcp"
    ports    = ["3478", "5349"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["turn-server"]
}

resource "google_compute_firewall" "https_allow" {
  name    = "sip-allow-https"
  network = google_compute_network.sip_network.id

  allow {
    protocol = "tcp"
    ports    = ["443"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["sip-server"]
}

resource "google_compute_firewall" "ssh_allow" {
  name    = "sip-allow-ssh"
  network = google_compute_network.sip_network.id

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = [var.ssh_source_cidr]
  target_tags   = ["sip-server"]
}

# Static IP Address
resource "google_compute_address" "sip_static_ip" {
  name   = "sip-server-static-ip"
  region = var.gcp_region
  address_type = "EXTERNAL"
}

# Compute Instance for SIP Server
resource "google_compute_instance" "sip_server" {
  name         = "demandgentic-sip-server"
  machine_type = var.machine_type
  zone         = "${var.gcp_region}-a"

  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2204-lts"
      size  = 50
    }
  }

  network_interface {
    network_ip = "10.0.1.10"
    network    = google_compute_network.sip_network.id
    subnetwork = google_compute_subnetwork.sip_subnet.id

    access_config {
      nat_ip = google_compute_address.sip_static_ip.address
    }
  }

  tags = ["sip-server", "turn-server"]

  metadata = {
    enable-oslogin = "TRUE"
  }

  service_account {
    email  = google_service_account.sip_sa.email
    scopes = ["cloud-platform"]
  }

  metadata_startup_script = base64encode(templatefile("${path.module}/startup.sh", {
    github_token      = var.github_token
    public_ip         = google_compute_address.sip_static_ip.address
    gemini_api_key    = var.gemini_api_key
    database_url      = var.database_url
    redis_url         = var.redis_url
    turn_username     = var.turn_username
    turn_password     = var.turn_password
  }))

  depends_on = [
    google_compute_firewall.sip_allow,
    google_compute_firewall.rtp_allow,
    google_compute_firewall.turn_allow,
    google_compute_firewall.https_allow,
  ]
}

# Service Account for SIP Server
resource "google_service_account" "sip_sa" {
  account_id   = "demandgentic-sip-server"
  display_name = "DemandGentic SIP Server Service Account"
}

# IAM Role for Logging
resource "google_project_iam_member" "sip_logs" {
  project = var.gcp_project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.sip_sa.email}"
}

# IAM Role for Monitoring
resource "google_project_iam_member" "sip_monitoring" {
  project = var.gcp_project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.sip_sa.email}"
}

# Cloud SQL Database (optional)
resource "google_sql_database_instance" "demandgentic" {
  count = var.create_database ? 1 : 0

  name             = "demandgentic-postgres"
  database_version = "POSTGRES_15"
  region           = var.gcp_region

  settings {
    tier            = "db-f1-micro"
    availability_type = "REGIONAL"

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      backup_retention_settings {
        retained_backups = 30
      }
    }

    ip_configuration {
      private_network = google_compute_network.sip_network.id
      require_ssl     = true
    }
  }
}

resource "google_sql_database" "demandgentic" {
  count = var.create_database ? 1 : 0

  name     = "demandgentic"
  instance = google_sql_database_instance.demandgentic[0].name
}

resource "google_sql_user" "demandgentic" {
  count = var.create_database ? 1 : 0

  name     = var.db_user
  instance = google_sql_database_instance.demandgentic[0].name
  password = var.db_password
}

# Cloud Redis (optional)
resource "google_redis_instance" "demandgentic" {
  count = var.create_redis ? 1 : 0

  name           = "demandgentic-redis"
  memory_size_gb = 1
  tier           = "STANDARD_HA"
  region         = var.gcp_region
  zone           = "${var.gcp_region}-a"

  connect_mode       = "PRIVATE_SERVICE_ACCESS"
  network            = google_compute_network.sip_network.id
  reserved_ip_range  = "10.0.2.0/29"
}

# Outputs
output "sip_server_public_ip" {
  value       = google_compute_address.sip_static_ip.address
  description = "Public IP of the SIP server"
}

output "sip_server_internal_ip" {
  value       = google_compute_instance.sip_server.network_interface[0].network_ip
  description = "Internal IP of the SIP server"
}

output "database_connection_name" {
  value       = var.create_database ? google_sql_database_instance.demandgentic[0].connection_name : null
  description = "Cloud SQL connection name"
}

output "redis_host" {
  value       = var.create_redis ? google_redis_instance.demandgentic[0].host : null
  description = "Redis instance host"
}

output "redis_port" {
  value       = var.create_redis ? google_redis_instance.demandgentic[0].port : null
  description = "Redis instance port"
}
