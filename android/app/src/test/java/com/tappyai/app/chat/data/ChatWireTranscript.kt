package com.tappyai.app.chat.data

/**
 * One recorded `/api/chat` turn, byte-for-byte in the production wire format.
 *
 * THESE LINES ARE NOT INVENTED. The `8:` annotation and the `[TAPPY_PLACES]` block were generated
 * by running the server's own `buildPlacesLiveView` and `renderPlacesMarker` over a real
 * OpenStreetMap-sourced place, so the schema here cannot drift from the schema the backend emits:
 * if the server changes shape, this transcript is wrong in exactly the way a real reply would be.
 *
 * The turn carries everything a place turn carries: prose split across several `0:` deltas, the
 * live decision on its own `8:` frame, an inline photo, the durable marker in the text, a CTA block
 * AFTER the marker (the production order that broke the CTA parser once), and follow-ups.
 *
 * The second place is deliberately SPARSE - the source knew only a name and a map link - so a run
 * proves that missing optional data disappears instead of rendering as the "KHONG CO DU LIEU"
 * sentence the server used to persist.
 */
object ChatWireTranscript {
    /** A live place turn: prose, the `8:` decision, the photo, the durable marker, CTA, follow-ups. */
    val lines: List<String> = listOf(
        "0:\"Mình gợi ý hai quán bún bò ở Quận 1 nhé.\\n\\n\"",
        "8:[{\"kind\":\"tappy.places.v1\",\"v\":1,\"domain\":\"food\",\"ranked\":false,\"items\":[{\"id\":\"place:osm:10.77430,106.70090\",\"domain\":\"food\",\"kind\":\"place\",\"name\":\"Bún Bò Huế Đông Ba\",\"image\":\"https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=600\",\"address\":\"110 Nguyễn Du, Bến Nghé, Quận 1\",\"rating\":4.6,\"ratingCount\":1284,\"openingHours\":\"Mo-Su 06:00-22:00\",\"phone\":\"+84 28 3822 1234\",\"priceLevel\":1,\"distanceKm\":1.4,\"categories\":[\"vietnamese\",\"noodle\"],\"flags\":[\"wifi\",\"outdoorSeating\",\"vegetarian\"],\"rank\":0,\"actions\":[{\"kind\":\"order\",\"urlKind\":\"search\",\"url\":\"https://shopeefood.vn/dongba\",\"labelKey\":\"v3.action.order\",\"platform\":\"ShopeeFood\"},{\"kind\":\"maps\",\"urlKind\":\"direct\",\"url\":\"https://maps.google.com/?q=10.7743,106.7009\",\"labelKey\":\"v3.action.maps\"},{\"kind\":\"website\",\"urlKind\":\"direct\",\"url\":\"https://dongba.example\",\"labelKey\":\"v3.action.website\"},{\"kind\":\"call\",\"urlKind\":\"direct\",\"url\":\"tel:+842838221234\",\"labelKey\":\"v3.action.call\"}]},{\"id\":\"place:osm:10.78000,106.69000\",\"domain\":\"food\",\"kind\":\"place\",\"name\":\"Quán Vỉa Hè Cô Ba\",\"rank\":1,\"actions\":[{\"kind\":\"order\",\"urlKind\":\"search\",\"url\":\"https://shopeefood.vn/tim-kiem?q=Qu%C3%A1n%20V%E1%BB%89a%20H%C3%A8%20C%C3%B4%20Ba\",\"labelKey\":\"v3.action.order\",\"platform\":\"ShopeeFood\"},{\"kind\":\"maps\",\"urlKind\":\"direct\",\"url\":\"https://maps.google.com/?q=10.78,106.69\",\"labelKey\":\"v3.action.maps\"},{\"kind\":\"order\",\"urlKind\":\"search\",\"url\":\"https://food.grab.com/vn/en/s?searchKeyword=Qu%C3%A1n%20V%E1%BB%89a%20H%C3%A8%20C%C3%B4%20Ba\",\"labelKey\":\"v3.action.order\",\"platform\":\"GrabFood\"}]}]}]",
        "0:\"**Bún Bò Huế Đông Ba** nước dùng đậm vị, mở từ sáng sớm.\\nNguồn: https://vnexpress.net/quan-bun-bo-hue-ngon-quan-1-4712345.html\\n\\n\"",
        "0:\"![Ảnh địa điểm](https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=600)\\n\\n\"",
        "0:\"[TAPPY_PLACES]{\\\"v\\\":1,\\\"items\\\":[{\\\"id\\\":\\\"place:osm:10.77430,106.70090\\\",\\\"domain\\\":\\\"food\\\",\\\"kind\\\":\\\"place\\\",\\\"rank\\\":0,\\\"actions\\\":[{\\\"kind\\\":\\\"order\\\",\\\"urlKind\\\":\\\"search\\\",\\\"url\\\":\\\"https://shopeefood.vn/dongba\\\",\\\"labelKey\\\":\\\"v3.action.order\\\",\\\"platform\\\":\\\"ShopeeFood\\\"},{\\\"kind\\\":\\\"maps\\\",\\\"urlKind\\\":\\\"direct\\\",\\\"url\\\":\\\"https://maps.google.com/?q=10.7743,106.7009\\\",\\\"labelKey\\\":\\\"v3.action.maps\\\"},{\\\"kind\\\":\\\"website\\\",\\\"urlKind\\\":\\\"direct\\\",\\\"url\\\":\\\"https://dongba.example\\\",\\\"labelKey\\\":\\\"v3.action.website\\\"},{\\\"kind\\\":\\\"call\\\",\\\"urlKind\\\":\\\"direct\\\",\\\"url\\\":\\\"tel:+842838221234\\\",\\\"labelKey\\\":\\\"v3.action.call\\\"}],\\\"name\\\":\\\"Bún Bò Huế Đông Ba\\\",\\\"address\\\":\\\"110 Nguyễn Du, Bến Nghé, Quận 1\\\",\\\"rating\\\":4.6,\\\"ratingCount\\\":1284,\\\"openingHours\\\":\\\"Mo-Su 06:00-22:00\\\",\\\"phone\\\":\\\"+84 28 3822 1234\\\",\\\"image\\\":\\\"https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=600\\\",\\\"priceLevel\\\":1,\\\"distanceKm\\\":1.4},{\\\"id\\\":\\\"place:osm:10.78000,106.69000\\\",\\\"domain\\\":\\\"food\\\",\\\"kind\\\":\\\"place\\\",\\\"rank\\\":1,\\\"actions\\\":[{\\\"kind\\\":\\\"order\\\",\\\"urlKind\\\":\\\"search\\\",\\\"url\\\":\\\"https://shopeefood.vn/tim-kiem?q=Qu%C3%A1n%20V%E1%BB%89a%20H%C3%A8%20C%C3%B4%20Ba\\\",\\\"labelKey\\\":\\\"v3.action.order\\\",\\\"platform\\\":\\\"ShopeeFood\\\"},{\\\"kind\\\":\\\"order\\\",\\\"urlKind\\\":\\\"search\\\",\\\"url\\\":\\\"https://food.grab.com/vn/en/s?searchKeyword=Qu%C3%A1n%20V%E1%BB%89a%20H%C3%A8%20C%C3%B4%20Ba\\\",\\\"labelKey\\\":\\\"v3.action.order\\\",\\\"platform\\\":\\\"GrabFood\\\"},{\\\"kind\\\":\\\"maps\\\",\\\"urlKind\\\":\\\"direct\\\",\\\"url\\\":\\\"https://maps.google.com/?q=10.78,106.69\\\",\\\"labelKey\\\":\\\"v3.action.maps\\\"}],\\\"name\\\":\\\"Quán Vỉa Hè Cô Ba\\\"}]}[/TAPPY_PLACES]\"",
        "0:\"\\n[CTA_BUTTONS]{\\\"buttons\\\":[{\\\"label\\\":\\\"Xem bản đồ\\\",\\\"type\\\":\\\"maps\\\",\\\"url\\\":\\\"https://maps.google.com/?q=10.7743,106.7009\\\",\\\"primary\\\":true}]}[/CTA_BUTTONS]\\n\"",
        "0:\"[FOLLOWUPS]Quán nào gần hơn?|Có chỗ đậu xe không?\"",
        "d:{\"finishReason\":\"stop\"}",
    )
}
