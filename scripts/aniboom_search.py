import sys
import json
from anime_parsers_ru.parser_aniboom import AniboomParser

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing title argument"}))
        return
    
    title = sys.argv[1]
    try:
        parser = AniboomParser()
        results = parser.fast_search(title)
        
        # Get embed links for the results
        for res in results:
            try:
                embed_link = parser._get_embed_link(res['animego_id'])
                res['iframe'] = embed_link
            except Exception as e:
                res['iframe'] = None
                res['error'] = str(e)
                
        print(json.dumps({"status": "success", "results": results}))
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}))

if __name__ == "__main__":
    main()
