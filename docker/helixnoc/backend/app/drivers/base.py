from abc import ABC, abstractmethod
from typing import List, Dict, Optional

class OLTDriver(ABC):
    def __init__(self, host: str, port: int, username: str, password: str):
        self.host = host
        self.port = port
        self.username = username
        self.password = password

    @abstractmethod
    def connect(self):
        """Establish connection to OLT"""
        pass

    @abstractmethod
    def disconnect(self):
        """Close connection to OLT"""
        pass

    @abstractmethod
    def get_unauthorized_onus(self) -> List[Dict[str, str]]:
        """
        Return list of ONUs waiting for authorization.
        Expected format: [{"interface": "gpon-onu_1/2/1:1", "sn": "ZTEG12345678"}]
        """
        pass

    @abstractmethod
    def get_onu_power(self, pon_port: str, onu_id: str) -> Dict[str, Optional[float]]:
        """
        Return optical power dictionary.
        Expected format: {'rx': -20.5, 'tx': 2.3}
        """
        pass
