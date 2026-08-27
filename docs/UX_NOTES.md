# UX / UI — widok usera (nie Linear)

Design i smaczki **nie idą do Linear**. Nie ma jeszcze siatki ekranów, a w trakcie dojdą nowe widoki. Tu zrzucamy pomysły, jak wpadną. Priorytet: **konsola usera**, nie admin.

Admin może zostać brzydki. User ma czuć, że to produkt, nie panel dewelopera.

## Teraz (to, co user widzi na `dev`)

- Login → checkbox regulaminu → konsola (system, brief, Generuj, bloki).
- Biblioteka zapisanych promptów.
- Kredyty w headerze.
- Admin schowany, jeśli mail nie jest na `ADMIN_EMAILS`.

Brzydoty, które bolą usera (kolejka smaczków, nie ticketów):

- Flash całej konsoli zanim wpadnie „idź do loginu”.
- Taby po angielsku (`console`, `library`).
- Przycisk Generuj aktywny przy zerze kredytów — błąd dopiero po kliku.
- Brak stanu „ładowanie” / „konto zablokowane”.
- Wynik to surowy `<pre>` — skopiuj działa, ale zero poczucia „dostałem zestaw”.
- Biblioteka: płaska lista, foldery w API już są.

## Zasady gdy robimy UX

1. Najpierw **konsola + wynik generacji + login**. Biblioteka druga. Admin ostatni.
2. Jeden smaczek = jeden mały PR do `dev`, potem klik na preview.
3. Nie wklejamy `system_prompt` ani instrukcji N1/S1/R1 do frontu (stary `prompt_engine_v3.jsx` zostaje w szafie).
4. Nowe widoki dopisujemy poniżej, jak się pojawią — bez numeracji MYS.

## Parking pomysłów

Dopisz linijkę, jak wpadnie (Mati albo agent po rozmowie). Na razie pusto — tak ma być.

## Przyszłe widoki (puste, bo jeszcze nie wiadomo)

- Onboarding / „jak to działa” po pierwszym loginie
- Ekran „brak kredytów” (zanim będzie płatność)
- Lepsza biblioteka (foldery, szukaj)
- Cokolwiek wymyślimy przy klikaniu

Nie rozrysowujemy tego z góry.
