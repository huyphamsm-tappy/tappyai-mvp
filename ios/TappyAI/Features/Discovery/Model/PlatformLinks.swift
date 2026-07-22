import Foundation

enum PlatformLinks {
    static func buildFoodOrderLinks(placeName: String, address: String? = nil, city: String? = nil) -> [PlatformLink] {
        var parts = [placeName]
        if let city, !city.isEmpty { parts.append(city) }
        else if let address, !address.isEmpty { parts.append(address) }
        let q = parts.joined(separator: " ").addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        return [
            PlatformLink(name: "ShopeeFood", url: "https://shopeefood.vn/tim-kiem?q=\(q)"),
            PlatformLink(name: "GrabFood", url: "https://food.grab.com/vn/en/s?searchKeyword=\(q)"),
            PlatformLink(name: "BeFood", url: "https://be.com.vn/"),
        ]
    }

    static func buildTravelLinks(hotelName: String, city: String? = nil) -> [PlatformLink] {
        var parts = [hotelName]
        if let city, !city.isEmpty { parts.append(city) }
        let q = parts.joined(separator: " ").addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        return [
            PlatformLink(name: "Booking.com", url: "https://www.booking.com/search.html?ss=\(q)"),
            PlatformLink(name: "Agoda", url: "https://www.agoda.com/vi-vn/search?q=\(q)"),
            PlatformLink(name: "Grab", url: "https://www.grab.com/vn/transport/car/"),
            PlatformLink(name: "Xanh SM", url: "https://xanhsm.com/"),
        ]
    }

    static func buildSpaLinks(spaName: String, websiteUri: String? = nil, mapsLink: String? = nil) -> [PlatformLink] {
        var links: [PlatformLink] = []
        if let websiteUri, !websiteUri.isEmpty {
            links.append(PlatformLink(name: "Official Website", url: websiteUri))
        }
        let mq = spaName.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        links.append(PlatformLink(name: "Google Maps", url: mapsLink ?? "https://www.google.com/maps/search/\(mq)"))
        return links
    }

    static func buildEntertainmentLinks(venueName: String, websiteUri: String? = nil, mapsLink: String? = nil) -> [PlatformLink] {
        var links: [PlatformLink] = []
        if let websiteUri, !websiteUri.isEmpty {
            links.append(PlatformLink(name: "Official Website", url: websiteUri))
        }
        let mq = venueName.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        links.append(PlatformLink(name: "Google Maps", url: mapsLink ?? "https://www.google.com/maps/search/\(mq)"))
        return links
    }

    static func buildShoppingLinks(productName: String) -> [PlatformLink] {
        let q = productName.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        return [
            PlatformLink(name: "Shopee", url: "https://shopee.vn/search?keyword=\(q)"),
            PlatformLink(name: "Tiki", url: "https://tiki.vn/search?q=\(q)"),
            PlatformLink(name: "Lazada", url: "https://www.lazada.vn/catalog/?q=\(q)"),
            PlatformLink(name: "TikTok Shop", url: "https://www.tiktok.com/search?q=\(q)"),
        ]
    }

    static func forService(_ service: ServiceDetail) -> [PlatformLink] {
        let city = service.address.components(separatedBy: ",").last?.trimmingCharacters(in: .whitespaces)
        switch service.type {
        case "food":
            return buildFoodOrderLinks(placeName: service.name, address: service.address, city: city)
        case "hotel", "travel":
            return buildTravelLinks(hotelName: service.name, city: city)
        case "spa":
            return buildSpaLinks(spaName: service.name, mapsLink: service.mapsLink.isEmpty ? nil : service.mapsLink)
        case "entertainment":
            return buildEntertainmentLinks(venueName: service.name, mapsLink: service.mapsLink.isEmpty ? nil : service.mapsLink)
        case "shopping":
            return buildShoppingLinks(productName: service.name)
        default:
            return buildFoodOrderLinks(placeName: service.name, address: service.address, city: city)
        }
    }
}
