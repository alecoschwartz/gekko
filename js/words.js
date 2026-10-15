const BANK = {
  "Food": {
    words: ["Pizza","Sushi","Tacos","Pancakes","Ice cream","Spaghetti","Burgers","Popcorn","Curry","Salad","Donuts","Soup"],
    qs: ["When did you last have it?","Would you order it on a first date?","Sweet, salty, or something else?","What would you drink with it?","Better homemade or from a restaurant?","How would a toddler react to it?","What's the messiest way to eat it?","Would you eat it for breakfast?","What's the worst thing you could add to it?","How much would you pay for a really good one?"]
  },
  "Animals": {
    words: ["Penguin","Giraffe","Octopus","Kangaroo","Owl","Shark","Panda","Raccoon","Flamingo","Elephant","Snail","Dolphin"],
    qs: ["Would it make a good pet?","Who wins in a fight: it or a goose?","What job would it have if it were human?","Where are you most likely to see one?","What would it name its kids?","How would it get through airport security?","Would you want to be one for a day?","What's its favorite snack?","Would it be good at karaoke?","How would it ruin a dinner party?"]
  },
  "Places": {
    words: ["Beach","Airport","Library","Hospital","Casino","Space station","Zoo","Gym","Movie theater","Haunted house","Supermarket","Ski resort"],
    qs: ["What would you wear there?","How long until you'd get bored there?","Who would you bring with you?","What does it smell like?","Would you go there on a date?","What's the first thing you'd do when you arrive?","How loud is it?","Would you want to work there?","What would you never do there?","Would you go there alone at night?"]
  },
  "Jobs": {
    words: ["Firefighter","Chef","Astronaut","Dentist","Teacher","Pilot","Magician","Lifeguard","Plumber","DJ","Detective","Farmer"],
    qs: ["Would your parents be proud if you did it?","What tool do you need most?","What's the hardest part of the day?","How much do you think it pays?","What would you wear to do it?","Could you do it with a hangover?","Would you date someone who does it?","Could a robot do it?","What time does the day start?","Would you want it as a kid?"]
  },
  "Hobbies": {
    words: ["Camping","Karaoke","Bowling","Skydiving","Yoga","Fishing","Painting","Surfing","Chess","Baking","Hiking","Video games"],
    qs: ["How often do you do it?","What gear do you need?","Would you do it on a first date?","Better alone or with friends?","How would your grandma do at it?","How dangerous is it, 1 to 10?","What would make it more fun?","Where's the best place to do it?","How long before you'd get good at it?","Would you watch it on TV?"]
  },
  "Around the house": {
    words: ["Toaster","Umbrella","Toothbrush","Couch","Mirror","Vacuum","Pillow","Remote control","Fridge","Candle","Lamp","Microwave"],
    qs: ["How many do you own?","Which room is it in?","What would you do if it broke?","How much would you pay for a nice one?","Could you live without it?","What's the weirdest thing you could use it for?","Would it make a good gift?","How often do you clean it?","Would you lend yours to a neighbor?","What color is yours?"]
  }
};
Object.assign(BANK, {
  "Movies": {
    words: ["Titanic","Jaws","Frozen","Star Wars","Shrek","Toy Story","Jurassic Park","Harry Potter","The Lion King","Finding Nemo","Home Alone","The Matrix"],
    qs: ["How many times have you seen it?","Would you show it to a 6-year-old?","What snack goes with it?","Does it make you cry?","Would it be better as a musical?","Who would play you in it?","What time of year is best to watch it?","Would you watch it on a first date?","Who's the best character?","Would it work as a theme park ride?"]
  },
  "Sports": {
    words: ["Soccer","Basketball","Tennis","Golf","Swimming","Boxing","Baseball","Hockey","Volleyball","Skateboarding","Wrestling","Table tennis"],
    qs: ["Have you ever played it?","What would you wear to play it?","Would you pay to watch it live?","How tired would you be after an hour?","Could your grandma play it?","What's the most annoying part?","Is it a real sport?","How many people do you need?","Would you bet money on it?","What injury worries you most?"]
  },
  "Holidays": {
    words: ["Christmas","Halloween","Thanksgiving","New Year's Eve","Valentine's Day","Easter","Birthday","St. Patrick's Day","Fourth of July","Mother's Day","April Fools' Day","Hanukkah"],
    qs: ["How do you usually celebrate it?","What food do you eat on it?","Who do you spend it with?","Is it overrated?","How much money do you spend on it?","What would you wear?","What's the best part for kids?","Would you skip it for a free vacation?","What song do you hear on it?","How early do you start getting ready?"]
  },
  "Vehicles": {
    words: ["Bicycle","Helicopter","Submarine","Motorcycle","Bus","Train","Skateboard","Tractor","Hot air balloon","Cruise ship","Limousine","Rocket"],
    qs: ["Have you ever ridden one?","How fast does it go?","Who would you bring along?","Would you take it to work?","What's the scariest thing about it?","How much would one cost?","Could you sleep on it?","Where would you go in it?","Would it impress a date?","How long a trip could you handle?"]
  },
  "Clothing": {
    words: ["Socks","Hoodie","Tuxedo","Swimsuit","Pajamas","Sunglasses","Cowboy hat","High heels","Scarf","Crocs","Tie","Raincoat"],
    qs: ["When did you last wear it?","Would you wear it to a wedding?","How many do you own?","What color is best?","Would you wear it on a first date?","How much would you spend on one?","Is it comfortable?","Which celebrity would wear it?","What season is it for?","Would you wear it to a job interview?"]
  },
  "Drinks": {
    words: ["Coffee","Lemonade","Hot chocolate","Milkshake","Orange juice","Tea","Smoothie","Soda","Champagne","Water","Iced tea","Energy drink"],
    qs: ["When did you last have one?","Hot or cold?","What time of day do you drink it?","What would you eat with it?","How much do you pay for one?","Would you serve it at a party?","Could a kid have it?","How many could you drink in a row?","Where's the best place to get one?","Would you order it on a first date?"]
  },
  "Fantasy": {
    words: ["Dragon","Unicorn","Vampire","Mermaid","Zombie","Ghost","Wizard","Werewolf","Fairy","Troll","Alien","Robot"],
    qs: ["Would you be friends with one?","Where does it live?","Who wins: it or a bear?","Would it make a good roommate?","What does it eat?","What does it do on a day off?","Would you want to be one?","How would you defend yourself against one?","What's its biggest weakness?","Would it be good at your job?"]
  },
  "Landmarks": {
    words: ["Eiffel Tower","Statue of Liberty","Great Wall of China","Pyramids","Big Ben","Taj Mahal","Grand Canyon","Mount Everest","Niagara Falls","Colosseum","Golden Gate Bridge","Stonehenge"],
    qs: ["Have you been there?","How would you get there?","What would you bring?","How long would you stay?","Would you propose there?","What souvenir would you buy?","How crowded is it?","What would you post about it?","Would your grandparents enjoy it?","Is it worth the trip?"]
  }
});
const CATS = Object.keys(BANK);
