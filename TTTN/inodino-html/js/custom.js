// to get current year
function getYear() {
    var currentDate = new Date();
    var currentYear = currentDate.getFullYear();
    document.querySelector("#displayYear").innerHTML = currentYear;
}

getYear();

// nav menu 
function openNav() {
    document.getElementById("myNav").classList.toggle("menu_width");
    document
        .querySelector(".custom_menu-btn")
        .classList.toggle("menu_btn-style");
}

// for image modal
$(document).ready(function () {

    // Gets the video src from the data-src on each button
    var $imageSrc;
    $('.concept_section .search-box').click(function () {
        $imageSrc = $(this).data('bigimage');
    });
    console.log($imageSrc);



    // when the modal is opened autoplay it  
    $('#myModal').on('shown.bs.modal', function (e) {

        // set the video src to autoplay and not to show related video. Youtube related video is like a box of chocolates... you never know what you're gonna get

        $("#image").attr('src', $imageSrc);
    })


    // reset the modal image
    $('#myModal').on('hide.bs.modal', function (e) {
        // a poor man's stop video
        $("#image").attr('src', '');
    })


    // document ready  
});

// owl carousel script
$(".owl-carousel").owlCarousel({
    loop: true,
    margin: 20,
    navText: [],
    autoplay: true,
    autoplayHoverPause: true,
    responsive: {
        0: {
            items: 1
        },
        600: {
            items: 2
        },
        1000: {
            items: 3
        }
    }
});

// googlemap script

function myMap() {
    var mapProp = {
        center: new google.maps.LatLng(40.712775, -74.005973),
        zoom: 18,
    };
    var map = new google.maps.Map(document.getElementById("map"), mapProp);
}