import sys
import json
from anime_parsers_ru.parser_aniboom import AniboomParser
from anime_parsers_ru.parser_kodik import KodikParser

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Missing arguments: title shikimori_id"}))
        return
    
    title = sys.argv[1]
    shikimori_id = sys.argv[2]
    
    players = []
    
    # 1. Aniboom
    try:
        aniboom = AniboomParser()
        results = aniboom.fast_search(title)
        if results:
            # Get the first result's embed link
            embed_link = aniboom._get_embed_link(results[0]['animego_id'])
            players.append({
                "name": "Aniboom (Python)",
                "iframe": embed_link
            })
    except Exception as e:
        pass # Ignore errors
        
    # 2. Kodik
    try:
        # Use a public token, disable validation to suppress warnings
        kodik = KodikParser(token="a0457eb45312af80bbb9f3fb33de3e93", validate_token=False)
        results = kodik.search(title)
        if results:
            # Add all unique translations
            seen = set()
            for res in results:
                t_id = res.get('translation', {}).get('id')
                if t_id not in seen:
                    seen.add(t_id)
                    iframe = res.get('link')
                    if iframe:
                        if iframe.startswith('//'):
                            iframe = 'https:' + iframe
                        players.append({
                            "name": f"Kodik Python ({res.get('translation', {}).get('title', 'Unknown')})",
                            "iframe": iframe
                        })
    except Exception as e:
        pass # Ignore errors
        
    print(json.dumps({"status": "success", "players": players}))

if __name__ == "__main__":
    main()
