import requests
import json

BASE_URL = "http://127.0.0.1:5000" 

def test_health():
    """Test if API is running"""
    print("\n" + "="*50)
    print("Testing Health Check")
    print("="*50)
    
    try:
        response = requests.get(f"{BASE_URL}/api/health")
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            print(f"Response: {json.dumps(response.json(), indent=2)}")
            return True
        else:
            print(f"✗ Error Response:")
            print(f"Headers: {dict(response.headers)}")
            print(f"Body: {response.text}")
            return False
            
    except requests.exceptions.ConnectionError:
        print("✗ Cannot connect to the server!")
        print("Make sure Flask is running: python app.py")
        return False
    except Exception as e:
        print(f"✗ Unexpected error: {str(e)}")
        return False

def test_kpop_songs():
    """Test with predefined K-pop songs"""
    print("\n" + "="*50)
    print("Testing K-pop Songs")
    print("="*50)
    
    try:
        response = requests.get(f"{BASE_URL}/api/test-kpop")
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Success!")
            print(f"Total Songs Processed: {data['stats']['total_songs_processed']}")
            print(f"Total Producers: {data['stats']['total_producers']}")
            
            # Show first song
            if data['songs']:
                first_song = data['songs'][0]
                print(f"\nFirst Song: {first_song['song_name']} by {first_song['artist']}")
                print(f"Producers ({len(first_song['producers'])}):")
                for p in first_song['producers']:
                    print(f"  - {p['name']} (ID: {p['id']})")
            
            # Show network sample
            if data['network']:
                print(f"\nNetwork Sample (First Producer):")
                first_producer_id = list(data['network'].keys())[0]
                first_producer = data['network'][first_producer_id]
                print(f"  Name: {first_producer['name']}")
                print(f"  Total Songs: {first_producer['total_songs']}")
                print(f"  Unique Collaborators: {first_producer['unique_collaborators_count']}")
            
            return True
        else:
            print(f"✗ Error {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
    except requests.exceptions.ConnectionError:
        print("✗ Cannot connect to the server!")
        return False
    except Exception as e:
        print(f"✗ Error: {str(e)}")
        return False

def test_custom_songs():
    """Test with custom song list"""
    print("\n" + "="*50)
    print("Testing Custom Songs")
    print("="*50)
    
    songs = [
            {"title": "Good Goodbye", "artist": "HWASA"},
            {"title": "JUMP", "artist": "BLACKPINK"},
            {"title": "SPAGHETTI", "artist": "LE SSERAFIM"},
            {"title": "Do It", "artist": "Stray Kids"},
            {"title": "PSYCHO", "artist": "BABYMONSTER"},
            {"title": "Like JENNIE", "artist": "JENNIE"},
            {"title": "NOT CUTE ANYMORE", "artist": "ILLIT"},
            {"title": "THIS IS FOR", "artist": "TWICE"},
            {"title": "CEREMONY", "artist": "Stray Kids"},
            {"title": "Express Mode", "artist": "SUPER JUNIOR"},

            {"title": "Killin' It Girl", "artist": "j-hope feat. GloRilla"},
            {"title": "Mona Lisa", "artist": "j-hope"},
            {"title": "Don't Say You Love Me", "artist": "Jin"},
            {"title": "Style", "artist": "Hearts2Hearts"},
            {"title": "ShaLaLa", "artist": "SAY MY NAME"},
            {"title": "Rizz", "artist": "XLOV"},
            {"title": "I Don't Care", "artist": "Baby DONT Cry"},
            {"title": "Air", "artist": "YEJI"},
            {"title": "GO!", "artist": "CORTIS"},
            {"title": "Body", "artist": "Dayoung"},

            {"title": "In Your Fantasy", "artist": "ATEEZ"},
            {"title": "Beautiful Life", "artist": "ATEEZ"},
            {"title": "I Want It", "artist": "STAYC"},
            {"title": "Cameo Love", "artist": "tripleS"},
            {"title": "WHITE CAT", "artist": "YVES"},
            {"title": "ICARUS", "artist": "ARTMS"},
            {"title": "Attitude", "artist": "IVE"},
            {"title": "Love Language", "artist": "TXT"},
            {"title": "Beautiful Strangers", "artist": "TXT"},
            {"title": "Girls Will Be Girls", "artist": "ITZY"},

            {"title": "Takedown", "artist": "TWICE"},
            {"title": "HOT", "artist": "LE SSERAFIM"},
            {"title": "Rebel Heart", "artist": "IVE"},
            {"title": "Fly Up", "artist": "RIIZE"},
            {"title": "Elevator", "artist": "BAEKHYUN"},
            {"title": "FUTW", "artist": "LISA"},
            {"title": "WHEN I'M WITH YOU", "artist": "LISA feat. Tyla"},
            {"title": "Seoul City", "artist": "JENNIE"},
            {"title": "Apocalypse", "artist": "BIBI"},
            {"title": "DRAMA", "artist": "G-DRAGON"},

            {"title": "ICONIK", "artist": "ZEROBASEONE"},
            {"title": "BLUE", "artist": "ZEROBASEONE"},
            {"title": "Fame", "artist": "RIIZE"},
            {"title": "poppop", "artist": "NCT WISH"},
            {"title": "Bad Desire (With or Without You)", "artist": "ENHYPEN"},
            {"title": "Beat-Boxer", "artist": "NEXZ"},
            {"title": "Hollywood Action", "artist": "BOYNEXTDOOR"},
            {"title": "IF I SAY, I LOVE YOU", "artist": "BOYNEXTDOOR"},
            {"title": "Lips Hips Kiss", "artist": "KISS OF LIFE"},
            {"title": "BUBBLE GUM", "artist": "Kep1er"}

    ]
    
    try:
        response = requests.post(
            f"{BASE_URL}/api/process-and-build",
            json={"songs": songs},
            headers={"Content-Type": "application/json"}
        )
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Success!")
            print(f"\nStats:")
            print(f"  Songs Processed: {data['stats']['total_songs_processed']}")
            print(f"  Total Producers: {data['stats']['total_producers']}")
            print(f"  Songs with Collaborations: {data['stats']['total_songs_with_collaborations']}")
            
            if data['stats']['most_collaborative_producer']:
                mcp = data['stats']['most_collaborative_producer']
                print(f"\nMost Collaborative Producer:")
                print(f"  Name: {mcp['name']}")
                print(f"  Unique Collaborators: {mcp['collaborators_count']}")
                print(f"  Total Songs: {mcp['total_songs']}")
            
            # Save full response to file
            with open('test_output.json', 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            print("\n✓ Full output saved to 'test_output.json'")
            
            return True
        else:
            print(f"✗ Error {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
    except requests.exceptions.ConnectionError:
        print("✗ Cannot connect to the server!")
        return False
    except Exception as e:
        print(f"✗ Error: {str(e)}")
        return False

if __name__ == "__main__":
    print("="*50)
    print("MUSIC PRODUCER NETWORK API TESTS")
    print("="*50)
    print("\nChecking if server is running...")
    
    # First check if server is accessible
    try:
        response = requests.get(f"{BASE_URL}/api/health", timeout=2)
        if response.status_code == 403:
            print("\n⚠️  SERVER IS RUNNING BUT RETURNING 403 FORBIDDEN")
            print("\nPossible issues:")
            print("1. CORS configuration issue")
            print("2. Flask app security settings")
            print("3. Firewall blocking localhost")
            print("\nTry running the Flask app with:")
            print("  python app.py")
            print("\nAnd check the terminal output for errors.")
            exit(1)
    except requests.exceptions.ConnectionError:
        print("\n✗ FLASK SERVER IS NOT RUNNING!")
        print("\nPlease start the server first:")
        print("  python app.py")
        print("\nThen run this test script again.")
        exit(1)
    
    # Run tests
    tests_passed = 0
    total_tests = 3
    
    if test_health():
        tests_passed += 1
    
    if test_kpop_songs():
        tests_passed += 1
    
    if test_custom_songs():
        tests_passed += 1
    
    print("\n" + "="*50)
    print(f"TESTS COMPLETED: {tests_passed}/{total_tests} passed")
    print("="*50)