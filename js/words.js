// Questions should invite creative answers that prove you know the word
// without handing it to the outsider. Each category's questions are mixed with ANY_QS.
const BANK = {
  "Food": {
    words: ["Pizza","Sushi","Tacos","Pancakes","Ice cream","Spaghetti","Burgers","Popcorn","Curry","Salad","Donuts","Soup"],
    qs: ["What would it say if it could talk back while you ate it?","What would be written on its tombstone?","Which family member is most like it?","What would it do at a wedding reception?","What would its restaurant be called?","Describe its smell like a perfume ad.","If it were a crime, what crime would it be?","What would it be scared of?","What would it wear to a job interview?"]
  },
  "Animals": {
    words: ["Penguin","Giraffe","Octopus","Kangaroo","Owl","Shark","Panda","Raccoon","Flamingo","Elephant","Snail","Dolphin"],
    qs: ["What would it complain about in a one-star review?","What's its secret talent?","What would its podcast be about?","What would it bring to a potluck?","What's its most annoying habit as a roommate?","What would it get detention for?","What would its last words be?","What would it splurge on with a credit card?","What's its go-to karaoke song?"]
  },
  "Places": {
    words: ["Beach","Airport","Library","Hospital","Casino","Space station","Zoo","Gym","Movie theater","Haunted house","Supermarket","Ski resort"],
    qs: ["What's the plot of a horror movie set there?","Which celebrity would you want to be stuck there with?","What would the gift shop sell that it really shouldn't?","What's the unspoken rule there?","Who would you never take there?","What would your ex be doing there?","What's the worst thing you could yell there?","What would a dog think of it?","What would its reality show be called?"]
  },
  "Jobs": {
    words: ["Firefighter","Chef","Astronaut","Dentist","Teacher","Pilot","Magician","Lifeguard","Plumber","DJ","Detective","Farmer"],
    qs: ["What do they secretly google at work?","What would their superhero name be?","What's in their junk drawer?","What do they dream about at night?","What's their worst pickup line?","What's the gossip in their break room?","What would they be like as a parent?","What's their villain backstory?","What would their retirement party be like?"]
  },
  "Hobbies": {
    words: ["Camping","Karaoke","Bowling","Skydiving","Yoga","Fishing","Painting","Surfing","Chess","Baking","Hiking","Video games"],
    qs: ["What kind of person gets way too into it?","What would the world championship trophy look like?","What's the most dramatic way to quit it?","Which historical figure would be weirdly good at it?","What would its motivational poster say?","What would a cult built around it believe?","What would you name a team that does it?","What would your boss think if they caught you doing it?","What's the worst possible place to do it?"]
  },
  "Around the house": {
    words: ["Toaster","Umbrella","Toothbrush","Couch","Mirror","Vacuum","Pillow","Remote control","Fridge","Candle","Lamp","Microwave"],
    qs: ["What would it say about you behind your back?","What's its deepest fear?","If it came to life at night, what would it get up to?","What's its relationship status?","What would its band be called?","What other thing in the house is its nemesis?","What tattoo would it get?","What would it confess to a therapist?","What would it put on its résumé?"]
  },
  "Movies": {
    words: ["Titanic","Jaws","Frozen","Star Wars","Shrek","Toy Story","Jurassic Park","Harry Potter","The Lion King","Finding Nemo","Home Alone","The Matrix"],
    qs: ["What cocktail is it?","Which of your friends would cry watching it?","What would a terrible remake be called?","Rewrite the ending in five words.","What would its villain do on vacation?","What would its holiday special be like?","What's the drinking game rule for it?","What would a 5-year-old's review say?","What would it be like as a musical?"]
  },
  "Sports": {
    words: ["Soccer","Basketball","Tennis","Golf","Swimming","Boxing","Baseball","Hockey","Volleyball","Skateboarding","Wrestling","Table tennis"],
    qs: ["What would the halftime show look like?","Which family member would be the most dangerous at it?","What's the trash talk like?","What would happen if you played it at a funeral?","What would its mascot be?","What dumb rule would you add to it?","What would cats think of it?","How would you play it in space?","What would its fans get tattooed?"]
  },
  "Holidays": {
    words: ["Christmas","Halloween","Thanksgiving","New Year's Eve","Valentine's Day","Easter","Birthday","St. Patrick's Day","Fourth of July","Mother's Day","April Fools' Day","Hanukkah"],
    qs: ["What's the most chaotic thing that could happen on it?","How would it act at a party if it were a person?","What would its villain look like?","What's its unofficial smell?","Who would ruin it, and how?","What would a pet think was going on?","What would its rebrand be called?","What's the dress code if it were a nightclub?","What would it complain about to the other holidays?"]
  },
  "Vehicles": {
    words: ["Bicycle","Helicopter","Submarine","Motorcycle","Bus","Train","Skateboard","Tractor","Hot air balloon","Cruise ship","Limousine","Rocket"],
    qs: ["What would its road rage sound like?","What's its zodiac sign?","Who would be the worst person to share one with?","What would it name itself?","What's its scene in a getaway movie?","What snack belongs in it?","What would it be scared of?","What song is blasting from it?","What would it write in its diary?"]
  },
  "Clothing": {
    words: ["Socks","Hoodie","Tuxedo","Swimsuit","Pajamas","Sunglasses","Cowboy hat","High heels","Scarf","Crocs","Tie","Raincoat"],
    qs: ["What does it say about the person wearing it?","What crime would someone wearing it commit?","How would it look on a dog?","Which cartoon character would wear it best?","What's the theme of its fashion week show?","What's its mortal enemy in the closet?","How would a time traveler from 1800 react to it?","What's the most confident way to wear it?","What would it whisper to you in the morning?"]
  },
  "Drinks": {
    words: ["Coffee","Lemonade","Hot chocolate","Milkshake","Orange juice","Tea","Smoothie","Soda","Champagne","Water","Iced tea","Energy drink"],
    qs: ["Who orders it to look cool?","What's its personality at 2am?","Which celebrity is it?","What's its commercial jingle?","What would you name a racehorse after it?","What toast would you give with it?","What's the worst moment to spill it?","What would it say on a first date?","What's its life motto?"]
  },
  "Fantasy": {
    words: ["Dragon","Unicorn","Vampire","Mermaid","Zombie","Ghost","Wizard","Werewolf","Fairy","Troll","Alien","Robot"],
    qs: ["What's its LinkedIn headline?","What does it post on social media?","What's its skincare routine?","How would it do on a reality dating show?","What would its HR complaint be about?","What's its favorite TV show?","How would it spend a lottery win?","What's its biggest pet peeve?","What would it be like as your boss?"]
  },
  "Landmarks": {
    words: ["Eiffel Tower","Statue of Liberty","Great Wall of China","Pyramids","Big Ben","Taj Mahal","Grand Canyon","Mount Everest","Niagara Falls","Colosseum","Golden Gate Bridge","Stonehenge"],
    qs: ["What would it say if it could talk?","What's the worst tourist photo you could take there?","What would you sneak in?","What do the locals secretly think of it?","What's its dating app tagline?","What would happen if it moved to your hometown?","What's the most romantic thing to do there?","What would an alien think it's for?","What's its biggest regret?"]
  }
};

const ANY_QS = [
  "What emoji is it?",
  "What song plays when it walks into a room?",
  "Rate its vibe from 1 to 10 and defend your rating.",
  "What would its Instagram bio say?",
  "What would it be voted in the high school yearbook?",
  "What color is its aura?",
  "What would it order at a coffee shop?",
  "Which person here is most like it?",
  "What would it get arrested for?",
  "What's its villain origin story?",
  "What would your grandma say about it?",
  "What would its theme park ride be called?",
  "What's its love language?",
  "What would it bring to a desert island?",
  "If it were a smell, what would it be?",
  "What would it name its firstborn child?"
];
for (const c of Object.values(BANK)) c.qs = c.qs.concat(ANY_QS);

const CATS = Object.keys(BANK);
