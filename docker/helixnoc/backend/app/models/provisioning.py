from sqlalchemy import Column, Integer, String, DateTime, JSON, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.session import Base
from app.models.network import OLT

class ProvisioningTemplate(Base):
    __tablename__ = "provisioning_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    vendor = Column(String)  # 'ZTE', 'Huawei', 'VSOL'
    onu_model = Column(String, nullable=True) # Optional, for specific models
    service_mode = Column(String) # 'router', 'bridge'
    
    # Template para los comandos CLI (puede contener placeholders como {vlan}, {onu_sn})
    commands_template = Column(String)
    rollback_template = Column(String)
    
    # Certification fields
    certified = Column(Boolean, default=False)
    certified_by = Column(String, nullable=True)
    certified_at = Column(DateTime, nullable=True)
    certification_status = Column(String, default="draft") # draft, certified, deprecated
    template_version = Column(Integer, default=1)
    
    # Source tracking
    source_onu_interface = Column(String, nullable=True)
    source_olt_id = Column(Integer, ForeignKey("olts.id"), nullable=True)
    source_running_config = Column(String, nullable=True)
    
    # Testing tracking
    tested_on_model = Column(String, nullable=True)
    tested_on_firmware = Column(String, nullable=True)
    last_tested_at = Column(DateTime, nullable=True)
    last_test_result = Column(String, nullable=True)
    
    notes = Column(String, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @property
    def variables_schema(self):
        import re
        if not self.commands_template:
            return []
        matches = re.findall(r'\{([^}]+)\}', self.commands_template)
        # Deduplicate while preserving order
        return list(dict.fromkeys(matches))

class ProvisioningJob(Base):
    __tablename__ = "provisioning_jobs"

    id = Column(Integer, primary_key=True, index=True)
    olt_id = Column(Integer, ForeignKey("olts.id"))
    onu_sn = Column(String, index=True)
    template_id = Column(Integer, ForeignKey("provisioning_templates.id"))
    
    # status enum: pending, validating, connecting, provisioning, verifying, success, rollback, rollback_success, rollback_failed, failed
    status = Column(String, default="pending")
    
    # JSON containing the variables used to render the template (e.g. {"vlan": 100, "line_profile": "100M"})
    variables = Column(JSON, default=dict)
    
    # List of executed commands and their results: [{"cmd": "conf t", "res": "...", "success": true, "duration_ms": 10}]
    logs = Column(JSON, default=list)
    
    error_detail = Column(String, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    operator_id = Column(Integer, nullable=True) # ID del técnico

    olt = relationship("OLT")
    template = relationship("ProvisioningTemplate")

class VlanTransportJob(Base):
    __tablename__ = "vlan_transport_jobs"

    id = Column(Integer, primary_key=True, index=True)
    olt_id = Column(Integer, ForeignKey("olts.id"))
    vlan_profile_id = Column(Integer, ForeignKey("vlan_profiles.id"))
    
    # status enum: pending, validating, backup, connecting, creating_vlan, applying_transport, verifying, success, rollback, rollback_success, rollback_failed, failed
    status = Column(String, default="pending")
    
    # JSON containing the uplinks to configure e.g. ["xgei_1/19/1", "smartgroup1"]
    uplinks_target = Column(JSON, default=list)
    transport_mode = Column(String, default="tagged") # tagged, untagged
    
    # List of executed commands and their results
    logs = Column(JSON, default=list)
    error_detail = Column(String, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    operator_id = Column(Integer, nullable=True)

    olt = relationship("OLT")
    vlan_profile = relationship("VlanProfile")

class OnuModelProfile(Base):
    __tablename__ = "onu_model_profiles"

    id = Column(Integer, primary_key=True, index=True)
    vendor = Column(String, default="Unknown")
    model_name = Column(String, unique=True, index=True) # e.g. RL804GCW
    olt_type_name = Column(String, nullable=True) # Type string from OLT
    detected_count = Column(Integer, default=1)
    
    first_seen_at = Column(DateTime, default=datetime.utcnow)
    last_seen_at = Column(DateTime, default=datetime.utcnow)
    source_olt_id = Column(Integer, ForeignKey("olts.id"), nullable=True)
    
    # Visual & Spec Fields (Added from screenshot)
    pon_type = Column(String, default="GPON")
    ethernet_ports = Column(Integer, default=1)
    voip_ports = Column(Integer, default=0)
    wifi_ssids = Column(Integer, default=0)
    service_mode = Column(String, default="Bridging/Routing")
    image_url = Column(String, nullable=True)
    
    # Capabilities
    supports_wifi = Column(Boolean, default=False)
    supports_catv = Column(Boolean, default=False)
    supports_router = Column(Boolean, default=False)
    supports_bridge = Column(Boolean, default=True)
    supports_tr069 = Column(Boolean, default=False)
    supports_omci = Column(Boolean, default=True)
    supports_pppoe_router = Column(Boolean, default=False)
    
    # Default parameters
    default_line_profile = Column(String, nullable=True)
    default_service_profile = Column(String, nullable=True)
    default_tcont_profile = Column(String, nullable=True)
    default_gemport = Column(String, nullable=True)
    default_vlan_mode = Column(String, nullable=True)
    default_eth_mode = Column(String, nullable=True)
    
    certification_status = Column(String, default="detected")
    notes = Column(String, nullable=True)
    
    # Templates
    provisioning_template_id = Column(Integer, ForeignKey("provisioning_templates.id"), nullable=True)
    config_template_id = Column(Integer, ForeignKey("provisioning_templates.id"), nullable=True)
    
    # Extraction Tracking
    last_extracted_from_onu = Column(String, nullable=True)
    last_extracted_config = Column(String, nullable=True)
    last_extracted_at = Column(DateTime, nullable=True)

class SpeedProfile(Base):
    __tablename__ = "speed_profiles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    download_mbps = Column(Integer, default=0)
    upload_mbps = Column(Integer, default=0)
    upstream_profile = Column(String)
    downstream_profile = Column(String)
    uses_gpon_shaping = Column(Boolean, default=True)
    olt_vendor = Column(String, default="ZTE")
    notes = Column(String, nullable=True)
    status = Column(String, default="active") # active, disabled

class VlanProfile(Base):
    __tablename__ = "vlan_profiles"

    id = Column(Integer, primary_key=True, index=True)
    vlan_id = Column(Integer, index=True)
    name = Column(String)
    service_type = Column(String, default="internet") # internet, iptv, management, catv
    olt_id = Column(Integer, ForeignKey("olts.id"), nullable=True)
    site_gateway_id = Column(Integer, nullable=True)
    allowed_on_uplinks = Column(String, nullable=True)
    description = Column(String, nullable=True)
    status = Column(String, default="active") # active, disabled

class OnuModelTemplateMatrix(Base):
    __tablename__ = "onu_model_template_matrix"

    id = Column(Integer, primary_key=True, index=True)
    model_profile_id = Column(Integer, ForeignKey("onu_model_profiles.id"))
    provisioning_template_id = Column(Integer, ForeignKey("provisioning_templates.id"))
    
    firmware_version = Column(String, nullable=True) # Ej. RTL960x
    service_mode = Column(String) # bridge, router, tr069
    plan_name = Column(String, nullable=True)
    plan_agnostic = Column(Boolean, default=True)
    vlan_agnostic = Column(Boolean, default=True)
    
    # Perfiles Específicos
    upstream_profile = Column(String, nullable=True)
    downstream_profile = Column(String, nullable=True)
    vlan_strategy = Column(String, nullable=True) # transparent, tag, translate
    pppoe_mode = Column(String, nullable=True) # external, internal, none
    
    # Muestra de Configuración Real
    sample_onu_interface = Column(String, nullable=True)
    sample_config_snapshot = Column(String, nullable=True)
    
    certification_status = Column(String, default="tested") # tested, certified, deprecated
    tested_at = Column(DateTime, nullable=True)
    tested_by = Column(String, nullable=True)
    
    olt_vendor = Column(String, default="ZTE")
    olt_model = Column(String, nullable=True)
    
    notes = Column(String, nullable=True)
    is_default = Column(Boolean, default=False)

    model_profile = relationship("OnuModelProfile")
    template = relationship("ProvisioningTemplate")

class OnuConfigAudit(Base):
    __tablename__ = "onu_config_audits"

    id = Column(Integer, primary_key=True, index=True)
    onu_id = Column(Integer, ForeignKey("onus.id"), nullable=True) # Assuming relation to onu.id
    olt_id = Column(Integer, ForeignKey("olts.id"))
    onu_interface = Column(String, index=True)
    operation_type = Column(String, default="patch")
    
    # Payload & Hashing
    patch_hash_sha256 = Column(String)
    before_state = Column(JSON, nullable=True)
    after_state = Column(JSON, nullable=True)
    
    # Snapshot Text
    running_config_snapshot = Column(String)
    
    # Commands
    generated_patch = Column(JSON)
    rollback_patch = Column(JSON)
    
    # Execution
    status = Column(String) # success, failed, rollback_success, rollback_failed
    result = Column(JSON, nullable=True)
    error_message = Column(String, nullable=True)
    
    raw_cli_output = Column(String, nullable=True)
    verification_output = Column(String, nullable=True)
    rollback_output = Column(String, nullable=True)
    
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

class OnuOperationLock(Base):
    __tablename__ = "onu_operation_locks"

    id = Column(Integer, primary_key=True, index=True)
    onu_id = Column(Integer, ForeignKey("onus.id"), nullable=True)
    olt_id = Column(Integer, ForeignKey("olts.id"))
    onu_interface = Column(String, index=True)
    
    operation_type = Column(String) # e.g. 'config_patch', 'firmware_upgrade'
    locked_by = Column(String)
    
    locked_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime)
    
    status = Column(String, default="active") # active, released, expired
    job_reference = Column(String, nullable=True)

class ONUDeleteJob(Base):
    __tablename__ = "onu_delete_jobs"

    id = Column(Integer, primary_key=True, index=True)
    olt_id = Column(Integer, ForeignKey("olts.id"))
    onu_id_ref = Column(Integer, ForeignKey("onus.id"), nullable=True)
    onu_sn = Column(String)
    pon_interface = Column(String)
    onu_interface = Column(String)
    
    status = Column(String, default="pending")
    logs = Column(JSON, default=list)
    error_detail = Column(String, nullable=True)
    
    operator_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    
    olt = relationship("OLT")
