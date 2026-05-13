from sqlalchemy import Column, Integer, BigInteger, String, Boolean, ForeignKey, DateTime, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.session import Base

class SystemSetting(Base):
    __tablename__ = "system_settings"
    key = Column(String, primary_key=True, index=True)
    value = Column(String, nullable=True)
    description = Column(String, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class SiteGateway(Base):
    __tablename__ = "site_gateways"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    wg_ip = Column(String, nullable=True)
    wg_interface = Column(String, nullable=True)
    internal_subnets = Column(JSON, nullable=True)
    status = Column(String, default="pending_adoption")
    latency_ms = Column(Integer, nullable=True)
    last_ping_at = Column(DateTime, nullable=True)
    
    # Metadata Operacional
    description = Column(String, nullable=True)
    location = Column(String, nullable=True)
    isp_site = Column(String, nullable=True)
    technical_notes = Column(String, nullable=True)
    
    # Telemetría WireGuard
    last_handshake_at = Column(DateTime, nullable=True)
    rx_bytes = Column(Integer, default=0)
    tx_bytes = Column(Integer, default=0)
    peer_status = Column(String, default="unknown")
    
    # MikroTik Adoption Fields
    mikrotik_public_key = Column(String, nullable=True)
    override_wg_endpoint = Column(String, nullable=True)
    override_wg_port = Column(Integer, nullable=True)
    override_wg_public_key = Column(String, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    olts = relationship("OLT", back_populates="site_gateway")

class OLT(Base):
    __tablename__ = "olts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    ip_address = Column(String, unique=True, index=True)
    port = Column(Integer, default=23)
    protocol = Column(String, default="telnet")  # telnet o ssh
    username = Column(String)
    password = Column(String)
    is_active = Column(Boolean, default=True)

    # Multi-vendor Metadata
    vendor = Column(String, nullable=True)
    hardware_model = Column(String, nullable=True)
    firmware_version = Column(String, nullable=True)
    supported_onus = Column(JSON, nullable=True)
    snmp_port = Column(Integer, nullable=True, default=161)
    snmp_community = Column(String, nullable=True)
    auto_detect_capabilities = Column(Boolean, default=False)
    
    # Site Gateway Relation
    site_gateway_id = Column(Integer, ForeignKey("site_gateways.id"), nullable=True)
    site_gateway = relationship("SiteGateway", back_populates="olts")

    # Operational State & Ping Diagnostics
    is_enabled = Column(Boolean, default=True)
    last_sync_at = Column(DateTime, nullable=True)
    sync_duration_ms = Column(Integer, nullable=True)
    last_sync_error = Column(String, nullable=True)
    
    consecutive_sync_failures = Column(Integer, default=0)
    next_sync_allowed_at = Column(DateTime, nullable=True)

    last_ping_latency_ms = Column(Integer, nullable=True)
    last_ping_at = Column(DateTime, nullable=True)
    last_ping_status = Column(String, nullable=True)
    
    last_total_in_bps = Column(BigInteger, default=0)
    last_total_out_bps = Column(BigInteger, default=0)
    last_traffic_sync_at = Column(DateTime, nullable=True)

    onus = relationship("ONU", back_populates="olt", cascade="all, delete-orphan")

class ONU(Base):
    __tablename__ = "onus"

    id = Column(Integer, primary_key=True, index=True)
    olt_id = Column(Integer, ForeignKey("olts.id"))
    interface = Column(String, index=True) # ej. gpon-onu_1/2/1:4
    sn = Column(String, index=True)
    
    # Metadata extraida del running-config
    name = Column(String, nullable=True)
    description = Column(String, nullable=True)
    onu_type = Column(String, nullable=True)
    vlan = Column(String, nullable=True)
    service_profile = Column(String, nullable=True)
    bridge_router_mode = Column(String, nullable=True)
    pppoe_username = Column(String, nullable=True)
    
    status = Column(String, default="offline") # online, offline, los, power_off
    last_sync_at = Column(DateTime, default=datetime.utcnow)
    config_source = Column(String) # Manual, Auto-Discovery, ZTE_RUNNING_CONFIG
    
    # Management / TR-069 / HTTP Fields
    management_port = Column(Integer, nullable=True)
    management_username = Column(String, nullable=True)
    management_password = Column(String, nullable=True)
    
    # Soft Delete & Auditing
    deleted_at = Column(DateTime, nullable=True)
    deleted_by = Column(String, nullable=True)
    delete_reason = Column(String, nullable=True)
    last_backup_before_delete = Column(String, nullable=True)

    olt = relationship("OLT", back_populates="onus")

class OnuStateHistory(Base):
    __tablename__ = "onu_state_history"

    id = Column(Integer, primary_key=True, index=True)
    onu_id = Column(Integer, ForeignKey("onus.id"), index=True)
    status = Column(String)
    optical_power = Column(String, nullable=True) # Changed to String to allow "N/A" or "-25.4"
    sync_job_id = Column(Integer, ForeignKey("sync_jobs.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)



class PONLock(Base):
    __tablename__ = "pon_locks"
    
    id = Column(Integer, primary_key=True, index=True)
    olt_id = Column(Integer, ForeignKey("olts.id"), index=True)
    pon_interface = Column(String, index=True) # e.g. gpon-olt_1/1/1
    locked_by_job_id = Column(Integer, nullable=True)
    locked_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime)

class GponResourcePool(Base):
    __tablename__ = "gpon_resource_pool"
    
    id = Column(Integer, primary_key=True, index=True)
    scope = Column(String) # pon or onu
    olt_id = Column(Integer, ForeignKey("olts.id"), index=True)
    pon_interface = Column(String, index=True) # e.g. gpon-olt_1/2/2
    onu_interface = Column(String, index=True, nullable=True) # e.g. gpon-onu_1/2/2:5
    resource_type = Column(String) # onu_id, tcont, gemport, service_port, vport
    allocated_value = Column(Integer)
    status = Column(String, default="reserved") # reserved, active
    locked_by_job_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)

class OLTBackup(Base):
    __tablename__ = "olt_backups"
    
    id = Column(Integer, primary_key=True, index=True)
    olt_id = Column(Integer, ForeignKey("olts.id"), index=True)
    filename = Column(String)
    file_size = Column(Integer)
    config_content = Column(String) # Store text directly
    checksum = Column(String, nullable=True)
    source = Column(String, default="manual") # manual, auto
    notes = Column(String, nullable=True)
    compressed = Column(Boolean, default=False)
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    olt = relationship("OLT")

class SyncJob(Base):
    __tablename__ = "sync_jobs"
    
    id = Column(Integer, primary_key=True, index=True)
    olt_id = Column(Integer, ForeignKey("olts.id"), index=True)
    job_type = Column(String) # fast, deep
    status = Column(String) # running, success, failed
    started_by = Column(String) # scheduler, manual, system
    progress_percent = Column(Integer, default=0)
    current_step = Column(String, nullable=True)
    command_count = Column(Integer, default=0)
    
    started_at = Column(DateTime, default=datetime.utcnow)
    finished_at = Column(DateTime, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    
    total_onus = Column(Integer, default=0)
    online_onus = Column(Integer, default=0)
    offline_onus = Column(Integer, default=0)
    
    changes_detected = Column(JSON, nullable=True)
    errors_detected = Column(JSON, nullable=True)
    result_summary = Column(String, nullable=True)
    raw_log = Column(String, nullable=True)
    
    olt = relationship("OLT")

class NetworkAlarm(Base):
    __tablename__ = "network_alarms"
    id = Column(Integer, primary_key=True, index=True)
    olt_id = Column(Integer, ForeignKey("olts.id"), index=True, nullable=True)
    onu_id = Column(Integer, ForeignKey("onus.id"), index=True, nullable=True)
    gateway_id = Column(Integer, ForeignKey("site_gateways.id"), index=True, nullable=True)
    severity = Column(String) # critical/warning/info
    alarm_type = Column(String) # los/offline/high_traffic/snmp_down/gateway_down/sync_error
    title = Column(String)
    description = Column(String, nullable=True)
    source = Column(String)
    status = Column(String, default="active") # active/resolved
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)

class InterfaceTrafficMetric(Base):
    __tablename__ = "interface_traffic_metrics"
    id = Column(Integer, primary_key=True, index=True)
    olt_id = Column(Integer, ForeignKey("olts.id"), index=True)
    interface_name = Column(String, index=True)
    interface_type = Column(String) # uplink, pon, management, unknown
    direction_in_bps = Column(BigInteger, default=0)
    direction_out_bps = Column(BigInteger, default=0)
    in_octets = Column(BigInteger, default=0)
    out_octets = Column(BigInteger, default=0)
    speed_bps = Column(BigInteger, default=0)
    utilization_in_percent = Column(String, default="0")
    utilization_out_percent = Column(String, default="0")
    source = Column(String, default="snmp")
    created_at = Column(DateTime, default=datetime.utcnow)

class ONUHistory(Base):
    __tablename__ = "onu_history"

    id = Column(Integer, primary_key=True, index=True)
    olt_id = Column(Integer, ForeignKey("olts.id"))
    sn = Column(String, index=True)
    last_interface = Column(String)
    last_name = Column(String, nullable=True)
    last_description = Column(String, nullable=True)
    last_pppoe_username = Column(String, nullable=True)
    last_vlan = Column(String, nullable=True)
    
    backup_config = Column(String, nullable=True)
    
    deleted_at = Column(DateTime, default=datetime.utcnow)
    deleted_by = Column(String, default="System")
    delete_reason = Column(String, nullable=True)
    
    olt = relationship("OLT")
