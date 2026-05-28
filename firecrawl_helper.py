import os
import sys
import json
import requests

FIRECRAWL_API_KEY = "fc-1f85d1f7cbb64363b42ee18cf963b165"
BASE_URL = "https://api.firecrawl.dev/v1"

def scrape_url(url, formats=["markdown"]):
    """
    Cào dữ liệu của một URL và trả về nội dung theo các định dạng yêu cầu.
    """
    headers = {
        "Authorization": f"Bearer {FIRECRAWL_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "url": url,
        "formats": formats,
        "onlyMainContent": True
    }
    
    print(f"[*] Đang cào dữ liệu từ: {url}...")
    try:
        response = requests.post(f"{BASE_URL}/scrape", json=payload, headers=headers)
        if response.status_code == 200:
            return response.json()
        else:
            print(f"[!] Lỗi: HTTP {response.status_code}")
            print(response.text)
            return None
    except Exception as e:
        print(f"[!] Lỗi kết nối: {str(e)}")
        return None

def search_web(query, limit=5):
    """
    Tìm kiếm thông tin trên web sử dụng Firecrawl Search.
    """
    headers = {
        "Authorization": f"Bearer {FIRECRAWL_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "query": query,
        "limit": limit
    }
    
    print(f"[*] Đang tìm kiếm: '{query}'...")
    try:
        response = requests.post(f"{BASE_URL}/search", json=payload, headers=headers)
        if response.status_code == 200:
            return response.json()
        else:
            print(f"[!] Lỗi: HTTP {response.status_code}")
            print(response.text)
            return None
    except Exception as e:
        print(f"[!] Lỗi kết nối: {str(e)}")
        return None

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Cách dùng:")
        print("  python firecrawl_helper.py scrape <URL>")
        print("  python firecrawl_helper.py search <Từ khóa>")
        sys.exit(1)
        
    action = sys.argv[1].lower()
    target = sys.argv[2]
    
    if action == "scrape":
        result = scrape_url(target)
        if result and result.get("success"):
            markdown_content = result.get("data", {}).get("markdown", "")
            print("\n=== KẾT QUẢ CÀO DỮ LIỆU ===\n")
            print(markdown_content[:2000])  # In ra 2000 ký tự đầu tiên
            
            # Lưu kết quả vào file cục bộ
            output_file = "scraped_data.md"
            with open(output_file, "w", encoding="utf-8") as f:
                f.write(markdown_content)
            print(f"\n[+] Đã lưu toàn bộ nội dung cào được vào file '{output_file}' trong workspace!")
        else:
            print("[!] Cào dữ liệu thất bại.")
            
    elif action == "search":
        result = search_web(target)
        if result and result.get("success"):
            data = result.get("data", [])
            print("\n=== KẾT QUẢ TÌM KIẾM ===\n")
            for idx, item in enumerate(data):
                print(f"{idx+1}. {item.get('title')} ({item.get('url')})")
                print(f"   Mô tả: {item.get('description')}\n")
        else:
            print("[!] Tìm kiếm thất bại.")
    else:
        print(f"[!] Hành động không hợp lệ: {action}")
