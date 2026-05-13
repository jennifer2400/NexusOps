import urllib.request
import urllib.error
try:
    req = urllib.request.Request('http://localhost:8000/api/provisioning/onu/1/gpon-onu_1%2F2%2F1%3A49', method='DELETE')
    res = urllib.request.urlopen(req)
    print(res.code, res.read().decode())
except urllib.error.HTTPError as e:
    print(e.code, e.read().decode())
