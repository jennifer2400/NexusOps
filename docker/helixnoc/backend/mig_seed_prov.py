from app.db.session import SessionLocal
from app.models.provisioning import ProvisioningTemplate

db = SessionLocal()

existing = db.query(ProvisioningTemplate).filter_by(name="ZTE Bridge Básico (1 VLAN)").first()
if not existing:
    tmpl = ProvisioningTemplate(
        name="ZTE Bridge Básico (1 VLAN)",
        vendor="ZTE",
        service_mode="bridge",
        commands_template="""
conf t
pon-onu-mng {onu_interface}
  service 1 gemport 1 vlan {vlan}
  vlan port eth_0/1 mode tag vlan {vlan}
exit
interface {onu_interface}
  service-port 1 vport 1 user-vlan {vlan} vlan {vlan}
exit
""",
        rollback_template="""
conf t
interface {onu_interface}
  no service-port 1
exit
pon-onu-mng {onu_interface}
  no service 1
  no vlan port eth_0/1
exit
"""
    )
    db.add(tmpl)
    db.commit()
    print("Template ZTE insertado.")
else:
    print("Template ZTE ya existe.")

db.close()
