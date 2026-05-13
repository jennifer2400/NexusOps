import sys
from app.db.session import SessionLocal
from app.models.provisioning import ProvisioningTemplate
import json

def seed_templates():
    db = SessionLocal()
    try:
        # Template ZTE Bridge Simple
        simple_name = "ZTE Bridge Simple"
        simple = db.query(ProvisioningTemplate).filter(ProvisioningTemplate.name == simple_name).first()
        if not simple:
            simple = ProvisioningTemplate(name=simple_name, vendor="ZTE", service_mode="bridge")
            db.add(simple)
            
        simple.commands_template = """
interface {full_onu_interface}
name {name}
description {description}
tcont {tcont_index} profile {upstream_profile}
gemport {gemport_index} name {gemport_name} tcont {tcont_index}
switchport mode hybrid vport {vport}
service-port {service_port_index} vport {vport} user-vlan {vlan} vlan {vlan}
exit

pon-onu-mng {full_onu_interface}
service hsi gemport {gemport_index} vlan {vlan}
vlan port eth_0/1 mode tag vlan {vlan}
vlan port eth_0/2 mode tag vlan {vlan}
vlan port eth_0/3 mode tag vlan {vlan}
vlan port eth_0/4 mode tag vlan {vlan}
exit
"""
        simple.rollback_template = ""
        
        # Template ZTE Bridge GPON Shaping
        shaping_name = "ZTE Bridge GPON Shaping"
        shaping = db.query(ProvisioningTemplate).filter(ProvisioningTemplate.name == shaping_name).first()
        if not shaping:
            shaping = ProvisioningTemplate(name=shaping_name, vendor="ZTE", service_mode="bridge")
            db.add(shaping)
            
        shaping.commands_template = """
interface {full_onu_interface}
name {name}
description {description}
tcont {tcont_index} profile {upstream_profile}
gemport {gemport_index} name {gemport_name} tcont {tcont_index}
gemport {gemport_index} traffic-limit downstream {downstream_profile}
switchport mode hybrid vport {vport}
service-port {service_port_index} vport {vport} user-vlan {vlan} vlan {vlan}
exit

pon-onu-mng {full_onu_interface}
service hsi gemport {gemport_index} vlan {vlan}
vlan port eth_0/1 mode tag vlan {vlan}
vlan port eth_0/2 mode tag vlan {vlan}
vlan port eth_0/3 mode tag vlan {vlan}
vlan port eth_0/4 mode tag vlan {vlan}
exit
"""
        shaping.rollback_template = ""

        db.commit()
        print("¡Plantillas inyectadas exitosamente!")
    except Exception as e:
        print(f"Error guardando Plantillas: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_templates()
