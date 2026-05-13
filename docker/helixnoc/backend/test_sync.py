from app.core.scheduler import run_sync_job
import asyncio
import traceback
import sys

async def main():
    try:
        await run_sync_job(1, 'deep', 'manual')
    except Exception as e:
        traceback.print_exc()

if __name__ == '__main__':
    asyncio.run(main())
