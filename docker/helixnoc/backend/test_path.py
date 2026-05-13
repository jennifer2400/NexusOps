import urllib.parse
from fastapi import FastAPI
from fastapi.testclient import TestClient

app = FastAPI()

@app.delete("/onu/{olt_id}/{onu_interface:path}")
def delete_onu(olt_id: int, onu_interface: str):
    return {"received_interface": onu_interface}

client = TestClient(app)

# Simulate what fetch does with encodeURIComponent
encoded_int = urllib.parse.quote("gpon-onu_1/2/1:47", safe="")
response = client.delete(f"/onu/1/{encoded_int}")
print("Response with encodeURIComponent:", response.json())

# Simulate standard
response2 = client.delete("/onu/1/gpon-onu_1/2/1:47")
print("Response normal:", response2.json())
