/ralph-wiggum:ralph-loop "Implement the Celebrity Era Recognition Game in      
  emily-flambe/fun-celebrity-game. The app is deployed to                        
  funcelebritygame.emilycogsdill.com. Playwright verification against the live   
  site is the source of truth.                                                   
                                                                                 
  Stack (following llm-observatory patterns)                                     
                                                                                 
  - Cloudflare Workers + Hono backend                                            
  - React 19 + Vite frontend with Tailwind CSS                                   
  - Cloudflare D1 for session/config storage                                     
  - TMDB API for celebrity data (live fetch)                                     
  - Custom domain: funcelebritygame.emilycogsdill.com                            
                                                                                 
  Spec Location                                                                  
                                                                                 
  /Users/emilycogsdill/Downloads/celebrity-era-game-spec.md                      
                                                                                 
  TMDB API Setup                                                                 
                                                                                 
  First, set the TMDB secret:                                                    
  echo 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI1ZmExNDFhNWM0MDhlYzAyMGMyYmY5ZGFkOGY1MGNh
  YiIsIm5iZiI6MTc2ODY5OTk4OS43ODcwMDAyLCJzdWIiOiI2OTZjMzg1NTc3NTRlOTdjNGYyMGNiZWE
  iLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.IzB21LeywyC-c9kVqyZnDKHevBKduA
  eTnFQVyouj224' | wrangler secret put TMDB_API_TOKEN                            
                                                                                 
  Use Bearer token auth:                                                         
  fetch('https://api.themoviedb.org/3/person/popular', {                         
    headers: {                                                                   
      'Authorization': \`Bearer \${env.TMDB_API_TOKEN}\`,                        
      'Content-Type': 'application/json'                                         
    }                                                                            
  })                                                                             
  Image URLs: https://image.tmdb.org/t/p/w500{profile_path}                      
                                                                                 
  Key Implementation Areas                                                       
                                                                                 
  1. Data Model: Celebrity with relevance_window, popularity_score, top_works    
  2. TMDB Integration: Fetch popular people, compute relevance windows per spec  
  algorithm                                                                      
  3. Game Flow: Intro → Playing (Question/Reveal loop for 40 celebrities) →      
  Results                                                                        
  4. Era Distribution Algorithm: Compute recognition rate by year, smooth        
  distribution, derive metrics                                                   
  5. Results Visualization: Chart showing recognition by decade, center of       
  gravity, quick stats                                                           
  6. Session State: Track responses in D1, support resume from local storage     
                                                                                 
  Steps Each Iteration                                                           
                                                                                 
  1. Check current state: What's built? What's broken?                           
  2. Implement next piece of functionality                                       
  3. Run npm run typecheck && npm run build                                      
  4. If build fails, fix errors                                                  
  5. Deploy: npm run deploy                                                      
  6. Verify with Playwright:                                                     
    - Navigate to https://funcelebritygame.emilycogsdill.com                     
    - Click 'Start Game'                                                         
    - Answer Yes/No for several celebrities                                      
    - Verify reveal screen shows celebrity info                                  
    - Complete game or verify progress bar works                                 
    - Check results screen renders with chart                                    
  7. If Playwright verification passes end-to-end, output SHIPPED                
  8. If Playwright fails, analyze screenshot/console errors and fix              
                                                                                 
  Key Files                                                                      
                                                                                 
  - wrangler.toml (CF config, D1 binding, custom domain)                         
  - src/index.ts (Hono routes)                                                   
  - src/frontend/ (React app)                                                    
  - src/services/tmdb.ts (TMDB API client)                                       
  - src/db/ (D1 schema, queries)                                                 
                                                                                 
  Context                                                                        
                                                                                 
  - Rate limit TMDB calls (40 req/10s)                                           
  - Pre-fetch/cache celebrity images for smooth UX                               
  - Results should be shareable (encode in URL or generate image)                
                                                                                 
  CRITICAL: The game must be playable end-to-end on                              
  funcelebritygame.emilycogsdill.com. Playwright must be able to start a game,   
  answer questions, see reveals, and view results with the era distribution      
  chart.                                                                         
                                                                                 
  Output SHIPPED when Playwright confirms the full game flow works on the live   
  site.                                                                          
                                                                                 
  If stuck after 5 attempts on same error, pause and report the blocker."        
  --completion-promise "SHIPPED" --max-iterations 30
